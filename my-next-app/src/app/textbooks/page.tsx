
import React from 'react';
import { textbookService } from '@/lib/services/textbook';
import { TextbookUploadModal } from '@/components/textbooks/TextbookUploadModal';
import { Button } from '@/components/ui/button';
import { Plus, Book, User, Calendar } from 'lucide-react';
import Link from 'next/link';

// Force dynamic because we are reading from DB directly in Server Component
export const dynamic = 'force-dynamic';

export default function TextbooksPage() {
    const textbooks = textbookService.getAllTextbooks();

    return (
        <div className="container py-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">教材库</h1>
                    <p className="text-muted-foreground mt-2">
                        管理和学习您的专业教材，支持 AI 辅助阅读与检索。
                    </p>
                </div>
                <TextbookUploadModal>
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        上传教材
                    </Button>
                </TextbookUploadModal>
            </div>

            {textbooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg bg-muted/20">
                    <Book className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">暂无教材</h3>
                    <p className="text-muted-foreground mb-6 text-center max-w-sm">
                        上传您的第一本教材 (PDF 或 Markdown)，系统将自动为您构建目录并生成 AI 知识索引。
                    </p>
                    <TextbookUploadModal>
                        <Button>立即上传</Button>
                    </TextbookUploadModal>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {textbooks.map((book) => (
                        <Link key={book.id} href={`/textbooks/${book.id}`} className="group block h-full">
                            <div className="flex flex-col h-full bg-card border rounded-lg overflow-hidden transition-all hover:shadow-md hover:border-primary/50">
                                <div className="aspect-[4/5] bg-muted relative overflow-hidden">
                                    {/* Placeholder Cover or Image */}
                                    {book.cover_url ? (
                                        <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-100 to-blue-50 dark:from-indigo-950 dark:to-slate-900">
                                            <Book className="h-16 w-16 text-primary/20" />
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 flex flex-col flex-1">
                                    <h3 className="font-semibold text-lg line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                                        {book.title}
                                    </h3>
                                    <div className="flex items-center text-sm text-muted-foreground mb-4 space-x-4">
                                        <div className="flex items-center">
                                            <User className="h-3 w-3 mr-1" />
                                            <span className="truncate max-w-[80px]">{book.author || '佚名'}</span>
                                        </div>
                                        <div className="flex items-center">
                                            <Calendar className="h-3 w-3 mr-1" />
                                            <span>{new Date(book.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    {book.description && (
                                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                                            {book.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
