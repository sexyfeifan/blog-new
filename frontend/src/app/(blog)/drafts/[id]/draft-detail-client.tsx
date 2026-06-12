"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { blogApi } from "@/lib/api";
import type { Blog } from "@/types";
import {
    PUBLIC_CONTAINER,
    PublicCard,
} from "@/components/blog/public";
import { CalendarDays, Clock3, ArrowLeft, Loader2 } from "lucide-react";

export function DraftDetailClient() {
    const params = useParams();
    const router = useRouter();
    const [blog, setBlog] = useState<Blog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchBlog = useCallback(async () => {
        const id = Number(params.id);
        if (isNaN(id)) {
            setError("无效的文章 ID");
            setLoading(false);
            return;
        }
        const key = localStorage.getItem("drafts_key") || "";
        if (!key) {
            router.push("/drafts");
            return;
        }
        try {
            const data = await blogApi.getDraft(id, key);
            setBlog(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "文章加载失败");
        } finally {
            setLoading(false);
        }
    }, [params.id, router]);

    useEffect(() => {
        fetchBlog();
    }, [fetchBlog]);

    if (loading) {
        return (
            <main className={PUBLIC_CONTAINER + " py-12 text-center"}>
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                <p className="mt-4 text-sm text-slate-500 font-bold">加载中...</p>
            </main>
        );
    }

    if (error || !blog) {
        return (
            <main className={PUBLIC_CONTAINER + " py-12 text-center"}>
                <p className="text-lg font-extrabold text-red-500">{error || "文章未找到"}</p>
                <button
                    onClick={() => router.push("/drafts")}
                    className="mt-4 text-sm text-blue-500 hover:underline"
                >
                    返回草稿箱
                </button>
            </main>
        );
    }

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <main className="mx-auto w-[min(800px,calc(100vw-2rem))] py-8 px-4">
            <button
                onClick={() => router.push("/drafts")}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-6 font-bold"
            >
                <ArrowLeft className="h-4 w-4" />
                返回草稿箱
            </button>

            <article>
                <header className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                            草稿
                        </span>
                        {blog.category && (
                            <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-full text-xs font-bold">
                                📁
                                {blog.category.name}
                            </span>
                        )}
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#725d42] mb-4">
                        {blog.title}
                    </h1>
                    <div className="flex items-center gap-4 text-sm text-slate-500 font-bold">
                        <span className="flex items-center gap-1.5">
                            <CalendarDays className="h-4 w-4" />
                            {formatDate(blog.created_at)}
                        </span>
                        {blog.tags && blog.tags.length > 0 && (
                            <span>
                                {blog.tags.map((t: { name: string }) => `#${t.name}`).join(" ")}
                            </span>
                        )}
                    </div>
                </header>

                {blog.thumbnail && (
                    <div className="mb-8 rounded-2xl overflow-hidden">
                        <img
                            src={blog.thumbnail}
                            alt={blog.title}
                            className="w-full object-cover"
                        />
                    </div>
                )}

                <PublicCard color="default" className="p-6 md:p-8">
                    <div
                        className="prose prose-slate max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: blog.content || "" || "" }}
                    />
                </PublicCard>
            </article>
        </main>
    );
}
