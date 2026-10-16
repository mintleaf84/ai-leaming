import React from "react";
import { textbookService } from "@/lib/services/textbook";
import { Button } from "@/components/ui/button";
import { List } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { TextbookChat } from "@/components/textbooks/TextbookChat";

// Force dynamic because we are reading from DB directly in Server Component
export const revalidate = 60; // 开启 ISR，每 60 秒可以在后台重头生成一次，提升首屏响应速度

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chapter?: string }>;
}

export default async function TextbookReaderPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { chapter } = await searchParams;
  const textbookId = parseInt(id);

  const textbook = await textbookService.getTextbook(textbookId);
  if (!textbook) notFound();

  const chapters = await textbookService.getChapters(textbookId);
  const currentChapterId = chapter
    ? parseInt(chapter)
    : chapters.length > 0
      ? chapters[0].id
      : null;

  const currentChapter = currentChapterId
    ? await textbookService.getChapter(currentChapterId)
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex w-64 flex-col border-r bg-muted/20">
        <div className="p-4 border-b">
          <Link
            href="/textbooks"
            className="text-sm text-muted-foreground hover:text-primary mb-2 flex items-center"
          >
            &larr; 返回书架
          </Link>
          <h2 className="font-semibold truncate" title={textbook.title}>
            {textbook.title}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {chapters.map((chap) => (
            <Link
              key={chap.id}
              href={`/textbooks/${textbookId}?chapter=${chap.id}`}
              className={`block px-3 py-2 text-sm rounded-md mb-1 truncate transition-colors ${
                chap.id === currentChapterId
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={chap.title}
            >
              <div style={{ paddingLeft: `${((chap.level || 1) - 1) * 12}px` }}>
                {chap.title}
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" className="mr-2">
                <List className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader className="mb-4">
                <DrawerTitle>{textbook.title}</DrawerTitle>
              </DrawerHeader>
              <div className="overflow-y-auto h-[60vh] px-4">
                {chapters.map((chap) => (
                  <Link
                    key={chap.id}
                    href={`/textbooks/${textbookId}?chapter=${chap.id}`}
                    className={`block px-3 py-2 text-sm rounded-md mb-1 truncate ${
                      chap.id === currentChapterId
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <div
                      style={{
                        paddingLeft: `${((chap.level || 1) - 1) * 12}px`,
                      }}
                    >
                      {chap.title}
                    </div>
                  </Link>
                ))}
              </div>
            </DrawerContent>
          </Drawer>
          <h2 className="font-semibold truncate">{textbook.title}</h2>
        </div>

        {/* Reader Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12">
          <div className="max-w-3xl mx-auto">
            {currentChapter ? (
              <>
                <article className="prose dark:prose-invert max-w-none">
                  <h1>{currentChapter.title}</h1>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex, rehypeRaw]}
                    components={{
                      code: ({
                        className,
                        children,
                        ...props
                      }: React.HTMLAttributes<HTMLElement>) => {
                        return (
                          <code
                            className={`${className} bg-muted px-1.5 py-0.5 rounded text-sm`}
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {currentChapter.content}
                  </ReactMarkdown>
                </article>
                <TextbookChat
                  context={currentChapter.content}
                  title={textbook.title}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p>请选择左侧章节开始阅读</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
