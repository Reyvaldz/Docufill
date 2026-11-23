import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.datavalidation import DataValidation

from app.spreadsheets import (
    analyze_spreadsheet,
    extract_spreadsheet_data,
    generate_spreadsheet,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class AnalyzeSpreadsheetTests(unittest.TestCase):
    def test_sample_template_includes_date_field(self):
        sample_path = PROJECT_ROOT / 'samples' / 'sample-reimbursement.xlsx'

        analysis = analyze_spreadsheet(sample_path)

        fields = {field['label']: field for field in analysis['fields']}
        self.assertEqual({'Nama', 'Departemen', 'Tanggal'}, set(fields))
        self.assertEqual('date', fields['Tanggal']['input_type'])
        self.assertEqual(5, len(analysis['headers']))
        self.assertFalse(analysis['headers'][-1]['editable'])

    def test_detects_additional_short_labels_without_treating_title_as_field(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet['A1'] = 'Expense Request'
        worksheet['A2'] = 'NOMOR SURAT'
        worksheet['A3'] = 'Tanggal'
        worksheet['A5'] = 'Barang'
        worksheet['B5'] = 'Jumlah'
        worksheet['C5'] = 'Harga'
        worksheet['A6'] = None
        worksheet['B6'] = None
        worksheet['C6'] = None

        with tempfile.TemporaryDirectory() as temporary_directory:
            file_path = Path(temporary_directory) / 'template.xlsx'
            workbook.save(file_path)
            workbook.close()

            analysis = analyze_spreadsheet(file_path)

        self.assertEqual(
            ['NOMOR SURAT', 'Tanggal'],
            [field['label'] for field in analysis['fields']],
        )
        self.assertEqual('date', analysis['fields'][1]['input_type'])

    def test_detects_excel_dropdown_options_for_information_and_item_fields(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet['A2'] = 'Departemen'
        worksheet['A4'] = 'Barang'
        worksheet['B4'] = 'Prioritas'
        worksheet['C4'] = 'Jumlah'
        information_options = DataValidation(
            type='list',
            formula1='"Operasional,Keuangan"',
            allow_blank=True,
        )
        item_options = DataValidation(
            type='list',
            formula1='"Normal,Mendesak"',
            allow_blank=True,
        )
        worksheet.add_data_validation(information_options)
        worksheet.add_data_validation(item_options)
        information_options.add('B2')
        information_options.add('D2')
        item_options.add('B5')

        with tempfile.TemporaryDirectory() as temporary_directory:
            file_path = Path(temporary_directory) / 'template.xlsx'
            workbook.save(file_path)
            workbook.close()

            analysis = analyze_spreadsheet(
                file_path,
                custom_fields=[
                    {'key': 'project', 'label': 'Proyek', 'cell': 'D2'},
                ],
            )

        fields = {field['label']: field for field in analysis['fields']}
        headers = {header['label']: header for header in analysis['headers']}
        self.assertEqual(['Operasional', 'Keuangan'], fields['Departemen']['options'])
        self.assertEqual(['Normal', 'Mendesak'], headers['Prioritas']['options'])
        self.assertEqual(
            ['Operasional', 'Keuangan'],
            analysis['custom_fields'][0]['options'],
        )

    def test_extracted_custom_fields_keep_excel_dropdown_options(self):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet['A3'] = 'Barang'
        worksheet['B3'] = 'Departemen'
        validation = DataValidation(type='list', formula1='"Operasional,Keuangan"')
        worksheet.add_data_validation(validation)
        validation.add('C2')

        with tempfile.TemporaryDirectory() as temporary_directory:
            file_path = Path(temporary_directory) / 'template.xlsx'
            workbook.save(file_path)
            workbook.close()
            analysis = analyze_spreadsheet(file_path)

            workbook = load_workbook(file_path)
            metadata = workbook.create_sheet('_DocuFill')
            metadata.append(['key', 'label', 'cell', 'input_type'])
            metadata.append(['project', 'Proyek', 'C2', 'text'])
            workbook.save(file_path)
            workbook.close()

            extracted = extract_spreadsheet_data(file_path, analysis)

        self.assertEqual(
            ['Operasional', 'Keuangan'],
            extracted['custom_fields'][0]['options'],
        )

    def test_generated_document_fills_detected_fields_and_copies_formula_rows(self):
        sample_path = PROJECT_ROOT / 'samples' / 'sample-reimbursement.xlsx'
        analysis = analyze_spreadsheet(sample_path)
        values_by_label = {
            'Nama': 'Reyval',
            'Departemen': 'Operasional',
            'Tanggal': '2026-11-20',
        }
        fields = {
            field['key']: values_by_label[field['label']]
            for field in analysis['fields']
        }
        items = [
            {
                'column_1': 'Transport',
                'column_2': '2',
                'column_3': 'trip',
                'column_4': '50000',
            },
            {
                'column_1': 'Konsumsi',
                'column_2': '1',
                'column_3': 'paket',
                'column_4': '25000',
            },
        ]

        with tempfile.TemporaryDirectory() as temporary_directory:
            output_path = Path(temporary_directory) / 'generated.xlsx'
            generate_spreadsheet(sample_path, output_path, analysis, fields, items)

            generated_data = extract_spreadsheet_data(output_path, analysis)
            workbook = load_workbook(output_path, data_only=False)
            try:
                worksheet = workbook['Reimbursement']
                self.assertEqual('=B6*D6', worksheet['E6'].value)
                self.assertEqual('=B7*D7', worksheet['E7'].value)
            finally:
                workbook.close()

        self.assertEqual(values_by_label, {
            field['label']: generated_data['fields'][field['key']]
            for field in analysis['fields']
        })
        self.assertEqual(items, generated_data['items'])


if __name__ == '__main__':
    unittest.main()
