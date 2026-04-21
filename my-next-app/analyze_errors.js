const fs = require('fs');
const path = require('path');

const fileName = process.argv[2] || 'tsc_report_v4.txt';

function analyzeReport(filePath) {
    let content;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        // Try UTF-16
        try {
            content = fs.readFileSync(filePath, 'utf16le');
        } catch (e2) {
            console.error('Failed to read file: ' + filePath);
            return null;
        }
    }

    const lines = content.split('\n');
    const fileCounts = {};
    
    lines.forEach(line => {
        const match = line.match(/^([^(\s]+)\(/);
        if (match) {
            const fp = match[1].trim();
            fileCounts[fp] = (fileCounts[fp] || 0) + 1;
        }
    });

    const categories = {
        "Tests (__tests__)": 0,
        "Components": 0,
        "API Routes": 0,
        "Server Actions": 0,
        "Services/Lib": 0,
        "Pages": 0,
        "Others": 0
    };

    const sortedFiles = Object.entries(fileCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([file, errors]) => {
            if (file.includes('__tests__') || file.includes('tests/')) categories["Tests (__tests__)"] += errors;
            else if (file.includes('src/components/')) categories["Components"] += errors;
            else if (file.includes('src/lib/api/routes/')) categories["API Routes"] += errors;
            else if (file.includes('src/server/actions/')) categories["Server Actions"] += errors;
            else if (file.includes('src/lib/')) categories["Services/Lib"] += errors;
            else if (file.includes('src/app/') && file.includes('page.tsx')) categories["Pages"] += errors;
            else categories["Others"] += errors;
            
            return { file, errors };
        });

    return {
        summary: categories,
        top_files: sortedFiles.slice(0, 20)
    };
}

const result = analyzeReport(fileName);
if (result) {
    console.log(JSON.stringify(result, null, 2));
}
