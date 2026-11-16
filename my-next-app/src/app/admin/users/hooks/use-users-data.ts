"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUsersAction } from "@/server/actions/admin";
import type { UserAdminView } from "@/types/admin";
import { getPlansAction } from "@/server/actions/subscription";
import type { SubscriptionPlan } from "@/types";
import { toast } from "sonner";
import type { UserWithSubscription } from "../types";

/** 每页条数（分页参数与分页文案共用同一常量） */
export const USERS_PAGE_SIZE = 10;

/**
 * 用户管理页的取数层：用户列表（服务端分页/搜索）+ 套餐列表 + 三态。
 *
 * 只负责「拿数据 / 刷新 / 落地错误」，不含任何弹窗与渲染；
 * 操作成功后的后台刷新通过 `refreshInBackground` 暴露给动作层。
 */
export function useUsersData() {
  const [users, setUsers] = useState<UserWithSubscription[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Pagination state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = USERS_PAGE_SIZE;

  const [loadError, setLoadError] = useState<string | null>(null);
  // 请求序号：搜索/翻页会并发触发加载，旧请求晚返回时不能覆盖新请求的结果
  const reqIdRef = useRef(0);
  // 后台刷新独立序号：连续两次写操作（删用户 + 改角色）会连发两次后台刷新，
  // 只靠 reqId 无法区分「哪次后台刷新更新」，先发后到的那次会覆盖较新结果
  const bgSeqRef = useRef(0);
  // 当前查询条件的最新值：后台刷新的响应回来时用它判断「条件是否已经变了」
  const searchRef = useRef(search);
  const pageRef = useRef(page);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const loadUsers = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background === true;
      // 绑定发起时的查询条件：后台刷新绝不能拿"点击那一刻"的条件去覆盖新搜索的结果
      const snapshot = { search, page };
      // 前台请求才抢「最新请求」身份；后台刷新沿用当前序号，不使更新的前台请求失效
      const reqId = background ? reqIdRef.current : ++reqIdRef.current;
      // 后台刷新每次自增，只有「最后一次」能落地
      const bgSeq = background ? ++bgSeqRef.current : bgSeqRef.current;
      // 后台刷新（写操作成功后）不动 loading / 错误态：列表已经是可用状态
      if (!background) {
        setLoading(true);
        setLoadError(null);
      }
      const isStale = () =>
        reqId !== reqIdRef.current ||
        (background &&
          (bgSeq !== bgSeqRef.current ||
            searchRef.current !== snapshot.search ||
            pageRef.current !== snapshot.page));
      // 直接用模块常量而不是组件里的 limit 变量：避免 eslint 把「模块级冻结值」
      // 当成缺失依赖，导致 exhaustive-deps 新增 warning（存量基线只有 3 条）
      const offset = (snapshot.page - 1) * USERS_PAGE_SIZE;
      try {
        const result = await getUsersAction({
          limit: USERS_PAGE_SIZE,
          offset,
          query: snapshot.search,
        });
        // 已有更新的请求在飞，或查询条件已变：本次结果（含错误）一律丢弃
        if (isStale()) return;
        // safe-action 不抛错：serverError 与空 data 都算加载失败
        if (result.serverError) throw new Error(result.serverError);
        if (!result.data) throw new Error("用户列表返回为空，请稍后重试");
        // 后端现在直接返回订阅信息，无需前端再处理
        setUsers(result.data.users as UserWithSubscription[]);
        setTotal(result.data.total);
        // 前台结果已落地：让所有在途的后台刷新失效，避免旧数据把它盖回去
        if (!background) bgSeqRef.current++;
      } catch (error) {
        if (isStale()) return;
        if (background) {
          // audit-allow: 写操作已经成功，后台刷新失败只提示一次并保留旧列表，绝不把列表换成错误态
          console.warn("[AdminUsers] 写操作后的后台刷新失败，保留旧列表", {
            err: error,
          });
          toast.warning("列表刷新失败，请手动刷新");
          return;
        }
        // 加载失败 → 错误态 + 重试（degraded）
        console.error("[AdminUsers] 加载用户列表失败", { err: error });
        setLoadError(error instanceof Error ? error.message : String(error));
        return;
      } finally {
        // 最新请求结束时统一收 loading：否则前一请求被丢弃后 loading 会永久卡在 true
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [page, search],
  );

  // Debounce search resets page
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Reload when page or search changes (after debounce)
  useEffect(() => {
    loadUsers();
  }, [page, loadUsers]);

  const loadPlans = async () => {
    const result = await getPlansAction(true);
    if (result.serverError) {
      console.error("加载套餐失败", result.serverError);
    } else if (result.data?.success && result.data.plans) {
      setPlans(result.data.plans);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  /** 前台重新加载（错误态重试 / 手动刷新用） */
  const reload = useCallback(() => loadUsers(), [loadUsers]);
  /** 写操作成功后触发的后台刷新：不动 loading/错误态，失败只提示一次 */
  const refreshInBackground = useCallback(
    () => loadUsers({ background: true }),
    [loadUsers],
  );

  /** 局部更新单行（订阅乐观更新用），不触发重新取数 */
  const patchUser = useCallback((id: number, patch: Partial<UserAdminView>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  return {
    users,
    plans,
    loading,
    loadError,
    search,
    setSearch,
    page,
    setPage,
    total,
    limit,
    reload,
    refreshInBackground,
    patchUser,
  };
}

export type UseUsersDataResult = ReturnType<typeof useUsersData>;
