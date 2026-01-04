import { toast as sonnerToast } from "sonner"

export const useToast = () => {
    return {
        toast: ({ title, description, variant, ...props }: any) => {
            if (variant === "destructive") {
                sonnerToast.error(title, { description, ...props })
            } else {
                sonnerToast.success(title, { description, ...props })
            }
        }
    }
}
