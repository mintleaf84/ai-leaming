"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubscriptionPlan } from "@/types";

interface SubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 目标用户名（打开时的快照） */
  username: string;
  plans: SubscriptionPlan[];
  selectedPlanId: string;
  onPlanChange: (planId: string) => void;
  /** 订阅时长（月），"0" 表示永久 */
  duration: string;
  onDurationChange: (duration: string) => void;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * 订阅设置对话框：套餐 + 时长。状态与保存动作在动作层，这里只做展示。
 */
export function SubscriptionDialog({
  open,
  onOpenChange,
  username,
  plans,
  selectedPlanId,
  onPlanChange,
  duration,
  onDurationChange,
  saving,
  onCancel,
  onConfirm,
}: SubscriptionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>设置订阅 - {username}</DialogTitle>
          <DialogDescription>为用户分配订阅套餐</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>选择套餐</Label>
            <Select value={selectedPlanId} onValueChange={onPlanChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} -{" "}
                    {plan.price_monthly === 0
                      ? "免费"
                      : `¥${plan.price_monthly / 100}/月`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>订阅时长</Label>
            <Select value={duration} onValueChange={onDurationChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">永久</SelectItem>
                <SelectItem value="1">1 个月</SelectItem>
                <SelectItem value="3">3 个月</SelectItem>
                <SelectItem value="6">6 个月</SelectItem>
                <SelectItem value="12">12 个月</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
