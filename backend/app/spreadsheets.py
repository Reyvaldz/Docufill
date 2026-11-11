from __future__ import annotations

import re
from copy import copy
from datetime import date
from math import isfinite
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.formula.translate import Translator
from openpyxl.utils.cell import coordinate_to_tuple, range_boundaries
from openpyxl.worksheet.worksheet import Worksheet


def analyze_spreadsheet(file_path: Path, include_existing_fields: bool = False) -> dict:
    workbook = load_workbook(file_path)
    candidates = []
    for worksheet in workbook.worksheets:
        analysis = _analyze_worksheet(worksheet, include_existing_fields)
        if analysis['headers']:
            candidates.append(analysis)

    if not candidates:
        workbook.close()
        raise ValueError(
            'Tidak ditemukan tabel dengan sedikitnya dua judul kolom berurutan pada file Excel.'
        )

    analysis = max(
        candidates,
        key=lambda item: (
            len(item['fields']) * 100 + len(item['headers']),
            item['sheet_name'] == workbook.active.title,
        ),
    )
    workbook.close()
    return analysis


def _analyze_worksheet(worksheet: Worksheet, include_existing_fields: bool = False) -> dict:
    max_column = _last_content_column(worksheet)
    merged_ranges = [
        {
            'bounds': range_boundaries(merged_range.coord),
            'anchor': merged_range.start_cell.coordinate,
        }
        for merged_range in worksheet.merged_cells.ranges
    ]

    header_candidates = []
    for row_index in range(1, worksheet.max_row + 1):
        run = []
        runs = []
        for column_index in range(1, max_column + 1):
            cell = worksheet.cell(row_index, column_index)
            if isinstance(cell.value, str) and cell.value.strip():
                run.append(column_index)
            else:
                if len(run) >= 2:
                    runs.append(run)
                run = []
        if len(run) >= 2:
            runs.append(run)
        for columns in runs:
            headers = []
            for column_index in columns:
                cell = worksheet.cell(row_index, column_index)
                label = str(cell.value).strip()
                input_type = _input_type_for_label(label)
                prototype = worksheet.cell(row_index + 1, column_index)
                headers.append(
                    {
                        'key': f'column_{column_index}',
                        'label': label,
                        'column': column_index,
                        'cell': cell.coordinate,
                        'editable': (
                            input_type != 'sequence'
                            and prototype.data_type != 'f'
                        ),
                        'input_type': input_type,
                    }
                )
            header_candidates.append(
                {
                    'header_row': row_index,
                    'headers': headers,
                }
            )

    header_candidate = max(
        header_candidates,
        key=lambda candidate: (
            len(candidate['headers']),
            candidate['header_row'],
        ),
        default=None,
    )
    if not header_candidate:
        return {
            'sheet_name': worksheet.title,
            'header_row': None,
            'headers': [],
            'fields': [],
            'diagnostics': [],
        }

    header_row = header_candidate['header_row']
    fields = []
    seen_targets = set()
    for row_index in range(1, header_row):
        for column_index in range(1, max_column + 1):
            cell = worksheet.cell(row_index, column_index)
            label = cell.value
            if not isinstance(label, str) or not label.strip() or label.startswith('='):
                continue
            if not _is_document_input_label(label):
                continue

            label_right = _merged_right_edge(row_index, column_index, merged_ranges)
            target_column = label_right + 1
            while target_column <= max_column:
                target_cell = worksheet.cell(row_index, target_column)
                target_anchor = _merged_anchor(row_index, target_column, merged_ranges)
                if target_anchor is not None and target_anchor != target_cell.coordinate:
                    target_column += 1
                    continue
                if target_cell.value not in (None, '') and not include_existing_fields:
                    break
                if target_cell.coordinate not in seen_targets:
                    fields.append(
                        {
                            'key': f'field_{cell.coordinate}',
                            'label': label.strip().rstrip(':').strip(),
                            'row': row_index,
                            'column': target_column,
                            'label_cell': cell.coordinate,
                            'input_cell': target_cell.coordinate,
                            'input_type': _input_type_for_label(label),
                        }
                    )
                    seen_targets.add(target_cell.coordinate)
                break

    diagnostics = []
    footer_row = _find_total_row(worksheet, header_row, max_column)
    max_items = footer_row - header_row - 1 if footer_row else None
    if not fields:
        diagnostics.append(
            'Tidak ditemukan pasangan label dan sel kosong sebelum tabel. '
            'Pastikan label informasi berada di atas tabel dan area isian kosong berada tepat di sebelah kanannya.'
        )
    if not any(header['editable'] for header in header_candidate['headers']):
        diagnostics.append(
            'Semua kolom pada baris contoh berisi rumus. Pastikan baris item kosong pertama ada tepat di bawah header.'
        )

    return {
        'sheet_name': worksheet.title,
        'header_row': header_row,
        'headers': header_candidate['headers'],
        'fields': fields,
        'max_items': max_items,
        'max_column': max_column,
        'diagnostics': diagnostics,
    }


def _is_document_input_label(label: str) -> bool:
    normalized = re.sub(r'[^a-z0-9]+', ' ', label.casefold()).strip()
    accepted_labels = {
        'nama',
        'nama karyawan',
        'nama pemohon',
        'employee name',
        'tgl pengajuan',
        'tanggal pengajuan',
        'tgl dibutuhkan',
        'tanggal dibutuhkan',
        'departemen',
        'nama departemen',
        'nama departemen business unit',
        'business unit',
        'department',
    }
    return normalized in accepted_labels


def _input_type_for_label(label: str) -> str:
    normalized = re.sub(r'[^a-z0-9]+', ' ', label.casefold()).strip()
    if normalized in {'no', 'nomor', 'no urut', 'nomor urut', 'no item'}:
        return 'sequence'
    if normalized.startswith(('tgl ', 'tanggal ', 'date ')):
        return 'date'
    if normalized.startswith(
        ('jumlah', 'nominal', 'harga', 'kuantitas', 'qty', 'quantity')
    ):
        return 'number'
    return 'text'


def _last_content_column(worksheet: Worksheet) -> int:
    return max(
        (cell.column for cell in worksheet._cells.values() if cell.value is not None),
        default=1,
    )


def _find_total_row(worksheet: Worksheet, header_row: int, max_column: int) -> int | None:
    for row_index in range(header_row + 1, worksheet.max_row + 1):
        for column_index in range(1, max_column + 1):
            value = worksheet.cell(row_index, column_index).value
            if isinstance(value, str) and value.strip().casefold().startswith('total'):
                return row_index
    return None


def extract_spreadsheet_data(file_path: Path, analysis: dict) -> dict:
    workbook = load_workbook(file_path, data_only=False)
    try:
        if analysis['sheet_name'] not in workbook.sheetnames:
            raise ValueError('Sheet dokumen tidak ditemukan.')
        worksheet = workbook[analysis['sheet_name']]
        fields = {
            field['key']: _serialize_cell_value(
                worksheet.cell(field['row'], field['column']).value
            )
            for field in analysis['fields']
        }
        first_item_row = analysis['header_row'] + 1
        last_item_row = (
            first_item_row + analysis['max_items'] - 1
            if analysis['max_items'] is not None
            else worksheet.max_row
        )
        editable_headers = [
            header for header in analysis['headers'] if header['editable']
        ]
        items = []
        for row_index in range(first_item_row, last_item_row + 1):
            item = {
                header['key']: _serialize_cell_value(
                    worksheet.cell(row_index, header['column']).value
                )
                for header in editable_headers
            }
            if any(value not in (None, '') for value in item.values()):
                items.append(item)
        custom_fields = []
        if '_DocuFill' in workbook.sheetnames:
            metadata = workbook['_DocuFill']
            for row_index in range(2, metadata.max_row + 1):
                key, label, cell, input_type = (
                    metadata.cell(row_index, column).value for column in range(1, 5)
                )
                if not all(isinstance(value, str) and value for value in (key, label, cell)):
                    continue
                custom_fields.append(
                    {
                        'key': key,
                        'label': label,
                        'cell': cell,
                        'input_type': input_type or 'text',
                        'value': _serialize_cell_value(worksheet[cell].value),
                    }
                )
        return {'fields': fields, 'items': items, 'custom_fields': custom_fields}
    finally:
        workbook.close()


def _serialize_cell_value(value):
    if value is None:
        return ''
    if hasattr(value, 'isoformat') and not isinstance(value, str):
        return value.isoformat()[:10]
    return str(value)


def _merged_right_edge(row: int, column: int, merged_ranges: list[dict]) -> int:
    for merged_range in merged_ranges:
        min_col, min_row, max_col, max_row = merged_range['bounds']
        if min_row <= row <= max_row and min_col <= column <= max_col:
            return max_col
    return column


def _merged_anchor(row: int, column: int, merged_ranges: list[dict]) -> str | None:
    for merged_range in merged_ranges:
        min_col, min_row, max_col, max_row = merged_range['bounds']
        if min_row <= row <= max_row and min_col <= column <= max_col:
            return merged_range['anchor']
    return None


def generate_spreadsheet(
    template_path: Path,
    output_path: Path,
    analysis: dict,
    fields: dict,
    items: list[dict],
    custom_fields: list[dict] | None = None,
) -> None:
    if not isinstance(fields, dict) or not isinstance(items, list) or not items:
        raise ValueError('Isi data dasar dan setidaknya satu baris item sebelum membuat dokumen.')

    max_items = analysis.get('max_items')
    if max_items is not None and len(items) > max_items:
        raise ValueError(f'Template ini hanya menyediakan ruang untuk {max_items} baris item.')

    if custom_fields is None:
        custom_fields = []
    if not isinstance(custom_fields, list):
        raise ValueError('Format informasi tambahan tidak valid.')

    workbook = load_workbook(template_path)
    if analysis['sheet_name'] not in workbook.sheetnames:
        workbook.close()
        raise ValueError('Sheet template tidak ditemukan.')

    worksheet = workbook[analysis['sheet_name']]
    header_row = analysis['header_row']
    first_item_row = header_row + 1
    prototype_row = first_item_row if first_item_row <= worksheet.max_row else None
    max_column = analysis.get('max_column', worksheet.max_column)
    columns = {
        header['key']: header['column']
        for header in analysis['headers']
        if header['editable']
    }

    try:
        existing_custom_fields = _read_custom_field_metadata(workbook)
        allowed_existing_cells = {field['cell'] for field in existing_custom_fields}
        occupied_cells = {
            field['input_cell'] for field in analysis['fields']
        } | {
            worksheet.cell(header_row, header['column']).coordinate
            for header in analysis['headers']
        }
        occupied_cells.update(
            worksheet.cell(row_index, header['column']).coordinate
            for row_index in range(first_item_row, first_item_row + (max_items or len(items)))
            for header in analysis['headers']
        )
        seen_custom_cells = set()
        seen_custom_keys = set()
        normalized_custom_fields = []
        if len(custom_fields) > 40:
            raise ValueError('Maksimal 40 informasi tambahan dapat ditambahkan.')

        for field in analysis['fields']:
            _set_input_value(
                worksheet.cell(field['row'], field['column']),
                fields.get(field['key']),
                field.get('input_type', 'text'),
            )

        for field in existing_custom_fields:
            worksheet[field['cell']].value = None

        for index, field in enumerate(custom_fields, start=1):
            if not isinstance(field, dict):
                raise ValueError('Format informasi tambahan tidak valid.')
            label = str(field.get('label', '')).strip()
            cell_reference = str(field.get('cell', '')).strip().upper()
            input_type = field.get('input_type', 'text')
            key = str(field.get('key') or f'custom_{index}')
            if not label:
                raise ValueError('Label informasi tambahan wajib diisi.')
            if not key or key in seen_custom_keys:
                raise ValueError('Kunci informasi tambahan tidak valid atau duplikat.')
            if input_type not in {'text', 'date', 'number'}:
                raise ValueError(f'Tipe input tidak valid untuk field {label}.')
            if not re.fullmatch(r'[A-Z]{1,3}[1-9][0-9]*', cell_reference):
                raise ValueError(f'Alamat sel tidak valid untuk field {label}.')
            try:
                target_row, target_column = coordinate_to_tuple(cell_reference)
            except ValueError as error:
                raise ValueError(f'Alamat sel tidak valid untuk field {label}.') from error
            if target_row > 1_048_576 or target_column > 16_384:
                raise ValueError(f'Alamat sel {cell_reference} berada di luar batas Excel.')
            target_cell = worksheet.cell(target_row, target_column)
            if target_cell.coordinate in seen_custom_cells:
                raise ValueError(f'Alamat sel {cell_reference} dipakai lebih dari satu field.')
            if target_cell.coordinate in occupied_cells:
                raise ValueError(f'Sel {cell_reference} berbenturan dengan bagian template lain.')
            if target_cell.value not in (None, '') and target_cell.coordinate not in allowed_existing_cells:
                raise ValueError(
                    f'Sel {cell_reference} sudah berisi data. Pilih sel kosong pada template.'
                )
            for merged_range in worksheet.merged_cells.ranges:
                if target_cell.coordinate in merged_range and target_cell.coordinate != merged_range.start_cell.coordinate:
                    raise ValueError(
                        f'Gunakan sel awal area gabungan {merged_range.start_cell.coordinate} untuk field {label}.'
                    )

            _set_input_value(target_cell, field.get('value'), input_type)
            normalized_custom_fields.append(
                {
                    'key': key,
                    'label': label,
                    'cell': target_cell.coordinate,
                    'input_type': input_type,
                }
            )
            seen_custom_cells.add(target_cell.coordinate)
            seen_custom_keys.add(key)

        if max_items is not None:
            for row_index in range(first_item_row, first_item_row + max_items):
                for header in analysis['headers']:
                    if header['input_type'] == 'sequence':
                        worksheet.cell(row_index, header['column']).value = None
                    elif header['editable']:
                        worksheet.cell(row_index, header['column']).value = None

        for item_index, item in enumerate(items):
            if not isinstance(item, dict):
                raise ValueError('Format data item tidak valid.')

            row_index = first_item_row + item_index
            if item_index and prototype_row is not None:
                _copy_prototype_row(worksheet, prototype_row, row_index, max_column)

            for header in analysis['headers']:
                if header['input_type'] == 'sequence':
                    worksheet.cell(row_index, header['column']).value = item_index + 1
            for key, column_index in columns.items():
                header = next(header for header in analysis['headers'] if header['key'] == key)
                _set_input_value(
                    worksheet.cell(row_index, column_index),
                    item.get(key),
                    header.get('input_type', 'text'),
                )

        workbook.calculation.fullCalcOnLoad = True
        workbook.calculation.forceFullCalc = True
        workbook.calculation.calcMode = 'auto'
        if '_DocuFill' in workbook.sheetnames:
            del workbook['_DocuFill']
        if normalized_custom_fields:
            metadata = workbook.create_sheet('_DocuFill')
            metadata.sheet_state = 'hidden'
            metadata.append(['key', 'label', 'cell', 'input_type'])
            for field in normalized_custom_fields:
                metadata.append(
                    [field['key'], field['label'], field['cell'], field['input_type']]
                )
        workbook.save(output_path)
    finally:
        workbook.close()


def _read_custom_field_metadata(workbook) -> list[dict]:
    if '_DocuFill' not in workbook.sheetnames:
        return []
    metadata = workbook['_DocuFill']
    return [
        {'key': metadata.cell(row_index, 1).value, 'cell': metadata.cell(row_index, 3).value}
        for row_index in range(2, metadata.max_row + 1)
        if isinstance(metadata.cell(row_index, 1).value, str)
        and isinstance(metadata.cell(row_index, 3).value, str)
    ]


def _copy_prototype_row(
    worksheet: Worksheet,
    source_row: int,
    target_row: int,
    max_column: int,
) -> None:
    worksheet.row_dimensions[target_row].height = worksheet.row_dimensions[source_row].height
    for column_index in range(1, max_column + 1):
        source = worksheet.cell(source_row, column_index)
        target = worksheet.cell(target_row, column_index)
        if source.has_style:
            target._style = copy(source._style)
        if source.number_format:
            target.number_format = source.number_format
        if source.value and isinstance(source.value, str) and source.value.startswith('='):
            try:
                target.value = Translator(source.value, origin=source.coordinate).translate_formula(
                    target.coordinate
                )
            except ValueError:
                target.value = source.value


def _set_input_value(cell, value, input_type: str = 'text') -> None:
    if value in (None, ''):
        cell.value = None
        return
    if input_type == 'date':
        try:
            cell.value = date.fromisoformat(str(value))
        except ValueError as error:
            raise ValueError('Tanggal harus valid dan menggunakan format YYYY-MM-DD.') from error
        return
    if input_type == 'number':
        try:
            number = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError('Jumlah harus berupa angka yang valid.') from error
        if not isfinite(number):
            raise ValueError('Jumlah harus berupa angka yang valid.')
        cell.value = int(number) if number.is_integer() else number
        return
    cell.value = str(value)
    cell.data_type = 's'
