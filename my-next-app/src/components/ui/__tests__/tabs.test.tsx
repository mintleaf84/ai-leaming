import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../tabs";

describe("Tabs Component", () => {
  it("renders tabs correctly with initial active state", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
        </TabsList>
        {/* forceMount 使两个面板都渲染到 DOM，以便验证 data-state */}
        <TabsContent value="tab1" forceMount>
          Content 1
        </TabsContent>
        <TabsContent value="tab2" forceMount>
          Content 2
        </TabsContent>
      </Tabs>,
    );

    // 初始状态：Tab 1 激活，Content 1 可见
    expect(screen.getByText("Content 1")).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Content 2")).toHaveAttribute(
      "data-state",
      "inactive",
    );

    // 验证无障碍属性（aria-selected）
    expect(screen.getByText("Tab 1").closest("button")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Tab 2").closest("button")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});
