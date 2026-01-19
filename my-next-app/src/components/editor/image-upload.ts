import { createImageUpload } from 'novel';
import { toast } from 'sonner';

// Base64 图片上传函数
const onUpload = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        // 检查文件大小 (2MB 限制)
        if (file.size > 2 * 1024 * 1024) {
            toast.error('图片大小不能超过 2MB');
            reject(new Error('Image too large'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result as string;
            toast.success('图片已上传');
            resolve(result);
        };
        reader.onerror = () => {
            toast.error('图片上传失败');
            reject(new Error('Upload failed'));
        };
        reader.readAsDataURL(file);
    });
};

export const uploadFn = createImageUpload({
    onUpload,
    validateFn: (file) => {
        if (!file.type.includes('image/')) {
            toast.error('只能上传图片文件');
            return false;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('图片大小不能超过 2MB');
            return false;
        }
        return true;
    },
});
