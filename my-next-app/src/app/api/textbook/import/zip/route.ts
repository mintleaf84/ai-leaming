
import { NextRequest, NextResponse } from 'next/server';
import { mineruService } from '@/lib/services/mineru-service';

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        if (!file.name.endsWith('.zip')) {
            return NextResponse.json({ error: 'Only .zip files are allowed' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        console.log(`[Mineru] Processing import for: ${file.name} (${buffer.length} bytes)`);

        try {
            const result = await mineruService.processMineruZip(buffer, file.name);
            return NextResponse.json({ success: true, ...result });
        } catch (serviceError: any) {
            console.error('[Mineru] Import Logic Failed:', serviceError);
            return NextResponse.json({ error: serviceError.message || 'Import processing failed' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('[Mineru] API Upload Failed:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
