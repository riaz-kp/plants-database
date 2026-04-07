import { createFileRoute } from '@tanstack/react-router';
import { CsvImportPage } from '@/components/plants/CsvImportPage';

export const Route = createFileRoute('/_authenticated/plants/import')({
    component: CsvImportPage,
});
