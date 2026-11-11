from __future__ import annotations

import re
from copy import copy
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.formula.translate import Translator
from openpyxl.utils.cell import range_boundaries
from openpyxl.worksheet.worksheet import Worksheet


def analyze_spreadsheet(file_path: Path) -> dict:
    workbook = load_workbook(file_path)
    candidates = []
    for worksheet in workbook.worksheets:
        analysis = _analyze_worksheet(worksheet)
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


def _analyze_worksheet(worksheet: Worksheet) -> dict:
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
        for column_index in range(1, worksheet.max_column + 1):
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
            headers = [
                {
                    'key': f'column_{column_index}',
                    'label': str(worksheet.cell(row_index, column_index).value).strip(),
                    'column': column_index,
                    'cell': worksheet.cell(row_index, column_index).coordinate,
                    'editable': worksheet.cell(row_index + 1, column_index).value in (None, ''),
                }
                for column_index in columns
            ]
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
        for column_index in range(1, worksheet.max_column + 1):
            cell = worksheet.cell(row_index, column_index)
            label = cell.value
            if not isinstance(label, str) or not label.strip() or label.startswith('='):
                continue
            if not _is_document_input_label(label):
                continue

            label_right = _merged_right_edge(row_index, column_index, merged_ranges)
            target_column = label_right + 1
            while target_column <= worksheet.max_column:
                target_cell = worksheet.cell(row_index, target_column)
                target_anchor = _merged_anchor(row_index, target_column, merged_ranges)
                if target_anchor is not None and target_anchor != target_cell.coordinate:
                    target_column += 1
                    continue
                if target_cell.value not in (None, ''):
                    break
                if target_cell.coordinate not in seen_targets:
                    fields.append(
                        {
                            'key': f'field_{cell.coordinate}',
                            'label': label.strip().rstrip(':'),
                            'row': row_index,
                            'column': target_column,
                            'label_cell': cell.coordinate,
                            'input_cell': target_cell.coordinate,
                        }
                    )
                    seen_targets.add(target_cell.coordinate)
                break

    diagnostics = []
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
        'diagnostics': diagnostics,
    }


def _is_document_input_label(label: str) -> bool:
    normalized = re.sub(r'[^a-z0-9]+', ' ', label.casefold()).strip()
    accepted_labels = {
        'nama',
        'nama karyawan',
        'nama pemohon',
        'employee name',
        'departemen',
        'nama departemen',
        'nama departemen business unit',
        'business unit',
        'department',
    }
    return normalized in accepted_labels


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
) -> None:
    if not isinstance(fields, dict) or not isinstance(items, list) or not items:
        raise ValueError('Isi data dasar dan setidaknya satu baris item sebelum membuat dokumen.')

    workbook = load_workbook(template_path)
    if analysis['sheet_name'] not in workbook.sheetnames:
        workbook.close()
        raise ValueError('Sheet template tidak ditemukan.')

    worksheet = workbook[analysis['sheet_name']]
    header_row = analysis['header_row']
    first_item_row = header_row + 1
    prototype_row = first_item_row if first_item_row <= worksheet.max_row else None
    columns = {
        header['key']: header['column']
        for header in analysis['headers']
        if header['editable']
    }

    for field in analysis['fields']:
        _set_input_value(
            worksheet.cell(field['row'], field['column']),
            fields.get(field['key']),
        )

    for item_index, item in enumerate(items):
        if not isinstance(item, dict):
            workbook.close()
            raise ValueError('Format data item tidak valid.')

        row_index = first_item_row + item_index
        if item_index and prototype_row is not None:
            _copy_prototype_row(worksheet, prototype_row, row_index)

        for key, column_index in columns.items():
            _set_input_value(worksheet.cell(row_index, column_index), item.get(key))

    workbook.calculation.fullCalcOnLoad = True
    workbook.calculation.forceFullCalc = True
    workbook.calculation.calcMode = 'auto'
    workbook.save(output_path)
    workbook.close()


def _copy_prototype_row(worksheet: Worksheet, source_row: int, target_row: int) -> None:
    worksheet.row_dimensions[target_row].height = worksheet.row_dimensions[source_row].height
    for column_index in range(1, worksheet.max_column + 1):
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


def _set_input_value(cell, value) -> None:
    if value is None:
        cell.value = None
        return
    cell.value = str(value)
    cell.data_type = 's'
