"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    Plus,
    Pencil,
    Trash2,
    Eye,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    FileCode,
    Loader2,
    Sparkles,
    Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { blogApi, aiApi, categoryApi } from "@/lib/api";
import type { Blog, PaginatedResponse, Category } from "@/types";
import { toast } from "sonner";

export default function BlogListPage() {
    const router = useRouter();
    const [blogs, setBlogs] = useState<PaginatedResponse<Blog> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentPage, setCurrentPage] = useState(1);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [blogToDelete, setBlogToDelete] = useState<Blog | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [summarizeDialogOpen, setSummarizeDialogOpen] = useState(false);
    const [summarizeOnlyEmpty, setSummarizeOnlyEmpty] = useState(true);
    const [summarizeConcurrency, setSummarizeConcurrency] = useState("3");
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [importContent, setImportContent] = useState("");
    const [importCategoryId, setImportCategoryId] = useState<string>("none");
    const [importStatus, setImportStatus] = useState("draft");
    const [isImporting, setIsImporting] = useState(false);
    const [importQueue, setImportQueue] = useState<{name: string; content: string}[]>([]);
    const [importProgress, setImportProgress] = useState({done: 0, total: 0});
    const [categories, setCategories] = useState<Category[]>([]);
    const pageSize = 10;

    const fetchBlogs = useCallback(async (page: number) => {
        setIsLoading(true);
        try {
            const data = await blogApi.list(page, pageSize);
            setBlogs(data);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "获取博客列表失败");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBlogs(currentPage);
        aiApi.status().then((res) => setAiEnabled(res.enabled)).catch(() => setAiEnabled(false));
        categoryApi.list().then(setCategories).catch(() => {});
    }, [currentPage, fetchBlogs]);

    const handleDelete = async () => {
        if (!blogToDelete) return;
        setIsDeleting(true);
        try {
            await blogApi.delete(blogToDelete.id);
            toast.success("删除成功");
            setDeleteDialogOpen(false);
            setBlogToDelete(null);
            fetchBlogs(currentPage);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "删除失败");
        } finally {
            setIsDeleting(false);
        }
    };

    const openDeleteDialog = (blog: Blog) => {
        setBlogToDelete(blog);
        setDeleteDialogOpen(true);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        });
    };

    const handleConvertMarkdown = async () => {
        setIsConverting(true);
        try {
            const result = await blogApi.convertMarkdown();
            if (result.errors.length > 0) {
                toast.warning(`转换完成：${result.converted} 成功，${result.errors.length} 失败`);
            } else {
                toast.success(`转换完成：${result.converted} 篇文章已转换`);
            }
            fetchBlogs(currentPage);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "转换失败");
        } finally {
            setIsConverting(false);
        }
    };

    const handleBatchSummarize = async () => {
        setSummarizeDialogOpen(false);
        setIsSummarizing(true);
        try {
            const result = await aiApi.batchSummarizeAll({
                onlyEmpty: summarizeOnlyEmpty,
                concurrency: parseInt(summarizeConcurrency),
            });
            if (result.errors.length > 0) {
                toast.warning(
                    `总结完成：${result.success}/${result.total} 成功，${result.errors.length} 失败`,
                    { description: result.errors.slice(0, 3).join("\n") }
                );
            } else if (result.total === 0) {
                toast.info("所有文章都已有摘要，无需处理");
            } else {
                toast.success(`总结完成：${result.success} 篇文章已生成摘要`);
            }
            fetchBlogs(currentPage);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "批量总结失败");
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleImportMarkdown = async () => {
        // 批量导入模式
        if (importQueue.length > 0) {
            setIsImporting(true);
            setImportProgress({done: 0, total: importQueue.length});
            let success = 0;
            let failed = 0;
            for (let i = 0; i < importQueue.length; i++) {
                try {
                    await blogApi.importMarkdown({
                        content: importQueue[i].content,
                        category_id: importCategoryId && importCategoryId !== "none" ? parseInt(importCategoryId) : undefined,
                        status: importStatus,
                    });
                    success++;
                } catch {
                    failed++;
                }
                setImportProgress({done: i + 1, total: importQueue.length});
            }
            setIsImporting(false);
            if (failed > 0) {
                toast.warning(`导入完成：${success} 成功，${failed} 失败`);
            } else {
                toast.success(`全部导入成功：${success} 篇文章`);
            }
            setImportQueue([]);
            setImportContent("");
            setImportDialogOpen(false);
            fetchBlogs(currentPage);
            return;
        }
        // 单篇导入模式
        if (!importContent.trim()) {
            toast.error("请输入 Markdown 内容");
            return;
        }
        setIsImporting(true);
        try {
            await blogApi.importMarkdown({
                content: importContent,
                category_id: importCategoryId && importCategoryId !== "none" ? parseInt(importCategoryId) : undefined,
                status: importStatus,
            });
            toast.success("Markdown 文章导入成功");
            setImportDialogOpen(false);
            setImportContent("");
            fetchBlogs(currentPage);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "导入失败");
        } finally {
            setIsImporting(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const validFiles = Array.from(files).filter(
            f => f.name.endsWith(".md") || f.name.endsWith(".markdown")
        );
        if (validFiles.length === 0) {
            toast.error("请选择 .md 或 .markdown 文件");
            return;
        }

        if (validFiles.length === 1) {
            // 单文件：直接加载到编辑区
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target?.result;
                if (typeof text === "string") {
                    setImportContent(text);
                    setImportQueue([]);
                    toast.success(`已加载文件: ${validFiles[0].name}`);
                }
            };
            reader.readAsText(validFiles[0]);
        } else {
            // 多文件：加入队列
            const queue: {name: string; content: string}[] = [];
            let loaded = 0;
            for (const file of validFiles) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const text = ev.target?.result;
                    if (typeof text === "string") {
                        queue.push({name: file.name, content: text});
                    }
                    loaded++;
                    if (loaded === validFiles.length) {
                        setImportQueue(queue);
                        setImportContent("");
                        toast.success(`已加载 ${queue.length} 个文件，点击导入开始批量处理`);
                    }
                };
                reader.readAsText(file);
            }
        }
        e.target.value = "";
    };

    const parseImportPreview = () => {
        if (!importContent.trim().startsWith("---")) return null;
        const afterFirst = importContent.slice(3);
        const endIdx = afterFirst.indexOf("\n---");
        if (endIdx === -1) return null;
        const fm = afterFirst.slice(0, endIdx);
        let title = "";
        let date = "";
        let tags = "";
        for (const line of fm.split("\n")) {
            const trimmed = line.trim();
            if (trimmed.startsWith("title:")) {
                title = trimmed.slice(6).trim().replace(/^["']|["']$/g, "");
            } else if (trimmed.startsWith("date:")) {
                date = trimmed.slice(5).trim();
            } else if (trimmed.startsWith("tags:")) {
                tags = trimmed.slice(5).trim();
            }
        }
        return { title, date, tags };
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">文章管理</h1>
                    <p className="text-muted-foreground">管理博客文章</p>
                </div>
                <div className="flex gap-2">
                    {aiEnabled && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSummarizeDialogOpen(true)}
                            disabled={isSummarizing}
                            title="为文章生成 AI 摘要"
                        >
                            {isSummarizing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            一键总结
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleConvertMarkdown}
                        disabled={isConverting}
                        title="将所有缺少 HTML 的文章从 Markdown 转换为 HTML"
                    >
                        {isConverting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <FileCode className="mr-2 h-4 w-4" />
                        )}
                        批量转换
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setImportDialogOpen(true)}
                        title="从 Markdown 导入文章"
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        导入 Markdown
                    </Button>
                    <Link href="/drafts" target="_blank">
                        <Button variant="outline" size="sm" title="查看草稿箱（需输入访问密钥）">
                            <FileCode className="mr-2 h-4 w-4" />
                            草稿箱
                        </Button>
                    </Link>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchBlogs(currentPage)}
                        disabled={isLoading}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        刷新
                    </Button>
                    <Link href="/admin/blogs/new">
                        <Button size="sm">
                            <Plus className="mr-2 h-4 w-4" />
                            新建文章
                        </Button>
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>文章列表</CardTitle>
                    <CardDescription>共 {blogs?.total ?? 0} 篇文章</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">ID</TableHead>
                                <TableHead>标题</TableHead>
                                <TableHead className="w-24">分类</TableHead>
                                <TableHead className="w-32">标签</TableHead>
                                <TableHead className="w-20">浏览量</TableHead>
                                <TableHead className="w-20">状态</TableHead>
                                <TableHead className="w-28">创建时间</TableHead>
                                <TableHead className="w-24 text-right">操作</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                    </TableRow>
                                ))
                            ) : blogs?.items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                        暂无文章
                                    </TableCell>
                                </TableRow>
                            ) : (
                                blogs?.items.map((blog) => (
                                    <TableRow key={blog.id}>
                                        <TableCell className="font-mono text-xs">{blog.id}</TableCell>
                                        <TableCell>
                                            <div className="max-w-xs truncate font-medium" title={blog.title}>
                                                {blog.title}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {blog.category ? (
                                                <Badge variant="outline">{blog.category.name}</Badge>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {blog.tags.slice(0, 2).map((tag) => (
                                                    <Badge key={tag.id} variant="secondary" className="text-xs">
                                                        {tag.name}
                                                    </Badge>
                                                ))}
                                                {blog.tags.length > 2 && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        +{blog.tags.length - 2}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1 text-muted-foreground">
                                                <Eye className="h-3 w-3" />
                                                {blog.view_count}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={blog.is_published ? "default" : "secondary"}>
                                                {blog.is_published ? "已发布" : "草稿"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatDate(blog.created_at)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => router.push(`/admin/blogs/${blog.id}`)}
                                                    title="编辑"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    onClick={() => openDeleteDialog(blog)}
                                                    title="删除"
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {blogs && blogs.total_pages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                                第 {currentPage} / {blogs.total_pages} 页
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1 || isLoading}
                                >
                                    <ChevronLeft className="h-4 w-4 mr-1" />
                                    上一页
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.min(blogs.total_pages, p + 1))}
                                    disabled={currentPage === blogs.total_pages || isLoading}
                                >
                                    下一页
                                    <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除</DialogTitle>
                        <DialogDescription>
                            确定要删除文章「{blogToDelete?.title}」吗？此操作不可撤销。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            disabled={isDeleting}
                        >
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? "删除中..." : "删除"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={summarizeDialogOpen} onOpenChange={setSummarizeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>批量生成摘要</DialogTitle>
                        <DialogDescription>
                            使用 AI 为文章批量生成摘要
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="only-empty">仅处理空摘要</Label>
                                <p className="text-sm text-muted-foreground">
                                    只为没有摘要的文章生成
                                </p>
                            </div>
                            <Switch
                                id="only-empty"
                                checked={summarizeOnlyEmpty}
                                onCheckedChange={setSummarizeOnlyEmpty}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="concurrency">并发数量</Label>
                            <Select value={summarizeConcurrency} onValueChange={setSummarizeConcurrency}>
                                <SelectTrigger id="concurrency">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 (最慢，最稳定)</SelectItem>
                                    <SelectItem value="3">3 (推荐)</SelectItem>
                                    <SelectItem value="5">5 (较快)</SelectItem>
                                    <SelectItem value="10">10 (最快，可能触发限流)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-sm text-muted-foreground">
                                同时处理的文章数量，数值越大越快，但可能触发 API 限流
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSummarizeDialogOpen(false)}>
                            取消
                        </Button>
                        <Button onClick={handleBatchSummarize}>
                            <Sparkles className="mr-2 h-4 w-4" />
                            开始生成
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>导入 Markdown 文章</DialogTitle>
                        <DialogDescription>
                            支持单文件或批量导入，文件需包含 YAML front matter
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" asChild>
                                <label className="cursor-pointer">
                                    <Upload className="mr-2 h-4 w-4" />
                                    选择文件（支持多选）
                                    <input
                                        type="file"
                                        accept=".md,.markdown"
                                        multiple
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                </label>
                            </Button>
                            {importQueue.length > 0 && (
                                <span className="text-sm text-green-600 font-medium">
                                    已加载 {importQueue.length} 个文件
                                </span>
                            )}
                            {importContent && !importQueue.length && (
                                <span className="text-sm text-muted-foreground">
                                    已加载 {importContent.length} 字符
                                </span>
                            )}
                        </div>

                        {/* 批量队列预览 */}
                        {importQueue.length > 0 && (
                            <div className="rounded-lg border p-3 space-y-1 text-sm max-h-32 overflow-y-auto">
                                <p className="font-medium">待导入文件：</p>
                                {importQueue.map((f, i) => (
                                    <p key={i} className="text-muted-foreground">
                                        {i + 1}. {f.name} ({f.content.length} 字符)
                                    </p>
                                ))}
                                <Button variant="ghost" size="sm" onClick={() => setImportQueue([])}>
                                    清空队列
                                </Button>
                            </div>
                        )}

                        {/* 导入进度 */}
                        {isImporting && importProgress.total > 0 && (
                            <div className="rounded-lg border p-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>导入中：{importProgress.done} / {importProgress.total}</span>
                                </div>
                                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all"
                                        style={{width: `${(importProgress.done / importProgress.total) * 100}%`}}
                                    />
                                </div>
                            </div>
                        )}

                        {/* 单文件编辑区 */}
                        {importQueue.length === 0 && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="import-content">Markdown 内容</Label>
                                    <Textarea
                                        id="import-content"
                                        value={importContent}
                                        onChange={(e) => setImportContent(e.target.value)}
                                        placeholder={`---
title: "文章标题"
date: 2026-01-01
tags: [tag1, tag2]
---

文章正文内容...`}
                                        rows={8}
                                        className="font-mono text-sm"
                                    />
                                </div>
                                {(() => {
                                    const preview = parseImportPreview();
                                    if (!preview) return null;
                                    return (
                                        <div className="rounded-lg border p-3 space-y-1 text-sm">
                                            <p><strong>预览：</strong></p>
                                            {preview.title && <p>标题：{preview.title}</p>}
                                            {preview.date && <p>日期：{preview.date}</p>}
                                            {preview.tags && <p>标签：{preview.tags}</p>}
                                        </div>
                                    );
                                })()}
                            </>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="import-category">分类</Label>
                                <Select value={importCategoryId} onValueChange={setImportCategoryId}>
                                    <SelectTrigger id="import-category">
                                        <SelectValue placeholder="选择分类（可选）" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">无分类</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={String(cat.id)}>
                                                {cat.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="import-status">状态</Label>
                                <Select value={importStatus} onValueChange={setImportStatus}>
                                    <SelectTrigger id="import-status">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="draft">草稿</SelectItem>
                                        <SelectItem value="published">发布</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {setImportDialogOpen(false); setImportQueue([]); setImportContent("");}}>
                            取消
                        </Button>
                        <Button
                            onClick={handleImportMarkdown}
                            disabled={isImporting || (!importContent.trim() && importQueue.length === 0)}
                        >
                            {isImporting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Upload className="mr-2 h-4 w-4" />
                            )}
                            {importQueue.length > 0 ? `导入 ${importQueue.length} 篇` : '导入'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
