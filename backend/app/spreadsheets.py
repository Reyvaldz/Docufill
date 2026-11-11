from __future__ import annotations

from copy import copy
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.formula.translate import Translator


def analyze_spreadsheet(file_path: Path) -> dict:
    workbook = load_workbook(file_path)
    worksheet = workbook.active
    merged_cells = {
        cell.coordinate
        for merged_range in worksheet.merged_cells.ranges
        for row in worksheet[merged_range.coord]
        for cell in row
    }

    header_row = None
    headers = []
    for row_index in range(1, worksheet.max_row + 1):
        populated = [
            column_index
            for column_index in range(1, worksheet.max_column + 1)
            if worksheet.cell(row_index, column_index).value not in (None, '')
        ]
        if any(right == left + 1 for left, right in zip(populated, populated[1:])):
            header_row = row_index
            headers = [
                {
                    'key': f'column_{column_index}',
                    'label': str(worksheet.cell(row_index, column_index).value).strip(),
                    'column': column_index,
                    'editable': (
                        worksheet.cell(row_index + 1, column_index).data_type != 'f'
                    ),
                }
                for column_index in populated
            ]
            break

    if header_row is None:
        workbook.close()
        raise ValueError('Tidak ditemukan baris header dengan setidaknya dua judul kolom berdampingan.')

    fields = []
    for row_index in range(1, header_row):
        for column_index in range(1, worksheet.max_column + 1):
            cell = worksheet.cell(row_index, column_index)
            label = cell.value
            target = worksheet.cell(row_index, column_index + 1)
            if (
                isinstance(label, str)
                and label.strip()
                and not label.startswith('=')
                and cell.coordinate not in merged_cells
                and target.coordinate not in merged_cells
                and target.value in (None, '')
            ):
                fields.append(
                    {
                        'key': f'field_{cell.coordinate}',
                        'label': label.strip().rstrip(':'),
                        'row': row_index,
                        'column': column_index + 1,
                    }
                )

    result = {
        'sheet_name': worksheet.title,
        'header_row': header_row,
        'headers': headers,
        'fields': fields,
    }
    workbook.close()
    return result


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

    workbook.save(output_path)
    workbook.close()


def _copy_prototype_row(worksheet, source_row: int, target_row: int) -> None:
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
