/** @vitest-environment jsdom */
import {
  render,
  renderHook,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * 批次 A3 / A4 的回归用例。
 *
 * A3：错题本首屏加载有两种失败形态，以前都被渲染成"太棒了！暂无错题"或永久转圈：
 *   1. action **throw** → `setIsLoading(false)` 被跳过；
 *   2. action 返回 `{ success:false }` / `serverError` / 空 data（safe-action 不抛错）
 *      → 全部 `|| []` 顶替 → 庆祝式空态。
 *   第三条用例是**反证**：真·空库必须仍然渲染空态，不能被抓成错误态。
 *
 * A4：文件夹下拉菜单的"删除"一次点击即落库。现在拆成 request（弹确认框）与
 *   confirm（真正调用）两步，取消不落库。
 *
 * 依赖边界：这里 mock 的是 server action 模块（客户端 hook 的直接依赖），
 * 不伪造数据库层——action 层自身的真库测试在 `src/server/actions/__tests__` 与
 * `src/lib/services/__tests__` 里。
 */

const {
  mockGetList,
  mockGetByTag,
  mockGetStats,
  mockGetMastered,
  mockGetFolders,
  mockDeleteFolder,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockGetList: vi.fn(),
  mockGetByTag: vi.fn(),
  mockGetStats: vi.fn(),
  mockGetMastered: vi.fn(),
  mockGetFolders: vi.fn(),
  mockDeleteFolder: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock("@/server/actions/wrong-questions", () => ({
  getWrongQuestionsAction: mockGetList,
  getWrongQuestionsByTagAction: mockGetByTag,
  getWrongQuestionsStatsAction: mockGetStats,
  getMasteredQuestionsAction: mockGetMastered,
  createWrongQuestionsPracticeAction: vi.fn(),
  getWrongQuestionDetailAction: vi.fn(),
  markAsMasteredAction: vi.fn(),
  unmarkMasteredAction: vi.fn(),
  getRandomWrongQuestionsAction: vi.fn(),
  getSimilarQuestionsAction: vi.fn(),
  createManualWrongQuestionAction: vi.fn(),
}));

vi.mock("@/server/actions/question-folders", () => ({
  getFoldersAction: mockGetFolders,
  createFolderAction: vi.fn(),
  renameFolderAction: vi.fn(),
  deleteFolderAction: mockDeleteFolder,
  addToFolderAction: vi.fn(),
  getFolderQuestionsAction: vi.fn().mockResolvedValue({
    data: { success: true, questions: [] },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { useWrongBookController } from "../hooks/use-wrong-book-controller";
import WrongBookPage from "../page";

/** 正常返回：空错题本 */
function resolveEmpty() {
  mockGetList.mockResolvedValue({
    data: { success: true, questions: [], total: 0 },
  });
  mockGetByTag.mockResolvedValue({ data: { success: true, find: [] } });
  mockGetStats.mockResolvedValue({
    data: { success: true, total: 0, recent: 0, frequent: 0 },
  });
  mockGetMastered.mockResolvedValue({ data: { success: true, questions: [] } });
  mockGetFolders.mockResolvedValue({ data: { success: true, folders: [] } });
}

/** 正常返回：有道题的错题本 + 一个装了 3 道题的自定义文件夹 */
function resolveWithData() {
  mockGetList.mockResolvedValue({
    data: { success: true, questions: [], total: 2 },
  });
  mockGetByTag.mockResolvedValue({ data: { success: true, find: [] } });
  mockGetStats.mockResolvedValue({
    data: { success: true, total: 2, recent: 1, frequent: 1 },
  });
  mockGetMastered.mockResolvedValue({ data: { success: true, questions: [] } });
  mockGetFolders.mockResolvedValue({
    data: {
      success: true,
      folders: [
        {
          id: 7,
          userId: 1,
          name: "易错集合",
          parentId: null,
          color: "#6b7280",
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          questionCount: 3,
        },
      ],
    },
  });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  resolveEmpty();
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("A3 首屏加载失败：形态一 action 抛错", () => {
  it("hook：loading 收尾为 false，loadError 带上原因，且打了结构化日志", async () => {
    mockGetStats.mockRejectedValue(new Error("数据库不可用"));

    const { result } = renderHook(() => useWrongBookController());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toContain("数据库不可用");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("页面：渲染 ErrorState（role=alert + 重试），不渲染庆祝式空态", async () => {
    mockGetList.mockRejectedValue(new Error("网络中断"));

    render(<WrongBookPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("错题本加载失败");
    expect(alert).toHaveTextContent("网络中断");
    expect(screen.getByRole("button", { name: /重试/ })).toBeInTheDocument();
    expect(screen.queryByText("太棒了！暂无错题")).not.toBeInTheDocument();
    // 不再永久转圈：骨架已卸载
    expect(screen.queryByText("错题本")).toBeInTheDocument();
  });
});

describe("A3 首屏加载失败：形态二 { success:false }（不抛错）", () => {
  it("hook：任一 action 返回 success:false 也算失败，不用空数组顶替", async () => {
    mockGetStats.mockResolvedValue({ data: { success: false } });

    const { result } = renderHook(() => useWrongBookController());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toContain("错题统计");
    expect(result.current.stats.total).toBe(0);
  });

  it("hook：serverError / 空 data 同样是失败", async () => {
    mockGetFolders.mockResolvedValue({ serverError: "查询超时" });
    mockGetMastered.mockResolvedValue({ data: undefined });

    const { result } = renderHook(() => useWrongBookController());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadError).toContain("查询超时");
    expect(result.current.loadError).toContain("已掌握题目");
  });

  it("页面：渲染 ErrorState，不渲染庆祝式空态", async () => {
    mockGetList.mockResolvedValue({ data: { success: false } });

    render(<WrongBookPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("错题本加载失败");
    expect(screen.queryByText("太棒了！暂无错题")).not.toBeInTheDocument();
  });
});

describe("A3 反证：真·空库仍然渲染空态", () => {
  it("五个 action 都成功且为空 → 庆祝文案，且无错误态", async () => {
    const { result } = renderHook(() => useWrongBookController());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.loadError).toBeNull();

    render(<WrongBookPage />);

    expect(await screen.findByText("太棒了！暂无错题")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("A3 重试：ErrorState 的 onRetry 会重新取数", () => {
  it("点击重试 → action 被再次调用，成功后回到正常页面", async () => {
    mockGetList.mockRejectedValue(new Error("一次性故障"));

    render(<WrongBookPage />);
    await screen.findByRole("alert");
    expect(mockGetList).toHaveBeenCalledTimes(1);

    resolveEmpty();
    fireEvent.click(screen.getByRole("button", { name: /重试/ }));

    await waitFor(() => expect(mockGetList).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("太棒了！暂无错题")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hook：loadData 可重入，重试成功后清掉 loadError", async () => {
    mockGetStats.mockRejectedValue(new Error("瞬时失败"));

    const { result } = renderHook(() => useWrongBookController());
    await waitFor(() => expect(result.current.loadError).not.toBeNull());

    resolveEmpty();
    await act(async () => {
      await result.current.loadData();
    });

    expect(result.current.loadError).toBeNull();
    expect(mockGetStats).toHaveBeenCalledTimes(2);
  });
});

describe("A4 删文件夹：菜单只请求，确认才落库", () => {
  it("requestDeleteFolder 只置待确认状态，不调用 deleteFolderAction", async () => {
    resolveWithData();
    const { result } = renderHook(() => useWrongBookController());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.requestDeleteFolder(7);
    });

    expect(result.current.pendingDeleteFolder).toEqual({
      id: 7,
      name: "易错集合",
      questionCount: 3,
    });
    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });

  it("cancelDeleteFolder 清状态且仍不落库；confirmDeleteFolder 才真正删除", async () => {
    resolveWithData();
    mockDeleteFolder.mockResolvedValue({ data: { success: true } });

    const { result } = renderHook(() => useWrongBookController());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.requestDeleteFolder(7);
    });
    act(() => {
      result.current.cancelDeleteFolder();
    });

    expect(result.current.pendingDeleteFolder).toBeNull();
    expect(mockDeleteFolder).not.toHaveBeenCalled();

    act(() => {
      result.current.requestDeleteFolder(7);
    });
    await act(async () => {
      await result.current.confirmDeleteFolder();
    });

    expect(mockDeleteFolder).toHaveBeenCalledTimes(1);
    expect(mockDeleteFolder).toHaveBeenCalledWith({ folderId: 7 });
    expect(result.current.pendingDeleteFolder).toBeNull();
  });

  it("空状态下的 confirm 是 no-op（没有待删对象就不落库）", async () => {
    resolveWithData();
    const { result } = renderHook(() => useWrongBookController());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.confirmDeleteFolder();
    });

    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });

  it("页面：下拉菜单点「删除」弹出带文件夹名的确认框，取消后不动数据", async () => {
    resolveWithData();
    render(<WrongBookPage />);

    await openFolderDeleteDialog();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("删除文件夹「易错集合」？");
    // 文案依据：deleteFolderAction 只删文件夹行，成员关系随外键级联删除，题目本身不动
    expect(dialog).toHaveTextContent(
      "其中的 3 道错题不会被删除，只是从这个文件夹移出",
    );
    expect(mockDeleteFolder).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });

  it("页面：确认框点「确认删除」才调用 deleteFolderAction", async () => {
    resolveWithData();
    mockDeleteFolder.mockResolvedValue({ data: { success: true } });
    render(<WrongBookPage />);

    await openFolderDeleteDialog();
    await screen.findByRole("alertdialog");

    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(mockDeleteFolder).toHaveBeenCalledWith({ folderId: 7 }),
    );
    expect(mockToastSuccess).toHaveBeenCalledWith("文件夹已删除");
  });
});

/** 切到文件夹视图 → 打开该文件夹的下拉菜单 → 点「删除」 */
async function openFolderDeleteDialog() {
  await screen.findByText("全部 (0)");
  fireEvent.click(screen.getByRole("button", { name: "文件夹" }));

  const nameNode = await screen.findByText("易错集合");
  const row = nameNode.parentElement as HTMLElement;
  const trigger = within(row).getByRole("button");
  // Radix DropdownMenu 需要 pointerdown 才能展开
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

  fireEvent.click(await screen.findByRole("menuitem", { name: /删除/ }));
}
