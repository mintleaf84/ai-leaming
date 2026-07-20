declare module "driver.js" {
  interface DriverConfig {
    animate?: boolean;
    opacity?: number;
    padding?: number;
    allowClose?: boolean;
    showButtons?: ("close" | "next" | "previous")[];
    nextBtnText?: string;
    prevBtnText?: string;
    doneBtnText?: string;
    closeBtnText?: string;
    onClose?: () => void;
    onEnd?: () => void;
  }

  interface PopoverConfig {
    title?: string;
    description?: string;
    position?: "top" | "bottom" | "left" | "right";
  }

  interface Step {
    element: string;
    popover: PopoverConfig;
  }

  class Driver {
    constructor(config?: DriverConfig);
    defineSteps(steps: Step[]): void;
    start(): void;
    destroy(): void;
  }

  export = Driver;
}
