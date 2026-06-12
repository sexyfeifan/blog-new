"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { blogApi } from "@/lib/api";
import type { Blog, PaginatedResponse } from "@/types";
import { cn } from "@/lib/utils";
import {
  EmptyState,
  LoadingState,
  PageHero,
  PostCard,
  PUBLIC_CONTAINER,
} from "@/components/blog/public";
import { Button as AIButton, Card as AICard, Icon as AIIcon, Input as AIInput } from "animal-island-ui";
import { Lock } from "lucide-react";

const STORAGE_KEY = "drafts_access_key";

export function DraftsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [key, setKey] = useState("");
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 9;

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setStoredKey(saved);
      setKey(saved);
    }
  }, []);

  const currentPage = Number(searchParams.get("page")) || 1;

  useEffect(() => {
    setPage(currentPage);
  }, [currentPage]);

  const fetchDrafts = useCallback(
    async (accessKey: string, p: number) => {
      setLoading(true);
      setError(null);
      try {
        const data: PaginatedResponse<Blog> = await blogApi.listDrafts(
          accessKey,
          p,
          pageSize,
        );
        setBlogs(data.items);
        setPagination({ total: data.total, totalPages: data.total_pages });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "加载失败";
        setError(msg);
        setBlogs([]);
        setPagination({ total: 0, totalPages: 0 });
        if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("forbidden")) {
          localStorage.removeItem(STORAGE_KEY);
          setStoredKey(null);
        }
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    if (storedKey) {
      fetchDrafts(storedKey, page);
    }
  }, [storedKey, page, fetchDrafts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setStoredKey(trimmed);
    router.push("/drafts");
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStoredKey(null);
    setKey("");
    setBlogs([]);
    setPagination({ total: 0, totalPages: 0 });
  };

  if (!storedKey) {
    return (
      <main className={cn(PUBLIC_CONTAINER, "grid gap-6 py-8 px-4")}>
        <PageHero
          eyebrow="Drafts"
          title="草稿箱"
          description="输入访问密钥以查看未发布的草稿文章。"
        />
        <AICard
          color="default"
          className="mx-auto w-full max-w-md grid gap-5 p-6 border-2 border-[#725d42]/10"
        >
          <div className="flex items-center justify-center gap-2 font-extrabold text-[#725d42]">
            <Lock className="h-5 w-5" />
            <span>需要访问密钥</span>
          </div>
          <form onSubmit={handleSubmit} className="grid gap-3">
            <AIInput
              placeholder="请输入草稿访问密钥"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="font-bold"
            />
            {error ? (
              <p className="text-xs font-bold text-red-500">{error}</p>
            ) : null}
            <AIButton
              type="primary"
              htmlType="submit"
              className="w-full font-bold"
              disabled={!key.trim()}
            >
              <AIIcon name="icon-critterpedia" size={16} bounce />
              进入草稿箱
            </AIButton>
          </form>
        </AICard>
      </main>
    );
  }

  return (
    <main className={cn(PUBLIC_CONTAINER, "grid gap-6 py-8 px-4")}>
      <PageHero
        eyebrow="Drafts"
        title="草稿箱"
        description="以下是所有未发布的草稿文章，仅持有访问密钥的人可以查看。"
        stats={[{ label: "Drafts", value: pagination.total, description: "篇草稿" }]}
        actions={
          <AIButton
            type="default"
            className="font-bold"
            onClick={handleLogout}
          >
            退出访问
          </AIButton>
        }
      />

      {loading ? (
        <LoadingState label="正在加载草稿..." />
      ) : error ? (
        <EmptyState
          title="加载失败"
          description={error}
          icon={<AIIcon name="icon-critterpedia" size={32} />}
        />
      ) : blogs.length === 0 ? (
        <EmptyState
          title="暂无草稿"
          description="没有未发布的草稿文章。"
          icon={<AIIcon name="icon-design" size={32} />}
        />
      ) : (
        <section className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {blogs.map((blog) => (
              <DraftPostCard key={blog.id} blog={blog} />
            ))}
          </div>
          {pagination.totalPages > 1 ? (
            <AICard
              color="default"
              className="flex items-center justify-center gap-3 p-4 border-2 border-[#725d42]/10"
            >
              {page > 1 ? (
                <AIButton
                  type="default"
                  className="font-bold"
                  onClick={() => router.push(`/drafts?page=${page - 1}`)}
                >
                  上一页
                </AIButton>
              ) : null}
              <span className="text-xs font-bold text-[#725d42]/70">
                {page} / {pagination.totalPages}
              </span>
              {page < pagination.totalPages ? (
                <AIButton
                  type="default"
                  className="font-bold"
                  onClick={() => router.push(`/drafts?page=${page + 1}`)}
                >
                  下一页
                </AIButton>
              ) : null}
            </AICard>
          ) : null}
        </section>
      )}
    </main>
  );
}

function DraftPostCard({ blog }: { blog: Blog }) {
  const router = useRouter();

  return (
    <div
      className="relative cursor-pointer"
      onClick={() => router.push(`/drafts/${blog.id}`)}
    >
      <div className="absolute top-3 right-3 z-10">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
          草稿
        </span>
      </div>
      <PostCard blog={blog} />
    </div>
  );
}
