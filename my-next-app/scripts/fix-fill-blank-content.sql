-- 修复已导入的填空题内容
-- 将 <input> 标签替换为下划线占位符（_____）
-- 
-- 使用方法：
-- 1. 备份数据库
-- 2. 执行此 SQL 脚本
-- 3. 验证修复结果

-- 查看填空题总数
SELECT COUNT(*) as total_fill_blank FROM questions WHERE type = 'fill_blank';

-- 查看包含 input 标签的填空题
SELECT id, content FROM questions 
WHERE type = 'fill_blank' AND content_html LIKE '%<input%';

-- 执行修复（仅修复 content_html 包含 input 标签的题目）
UPDATE questions 
SET content = REPLACE(
    REPLACE(
        REPLACE(
            REPLACE(
                REPLACE(
                    REPLACE(
                        REPLACE(
                            content_html,
                            '<input type="text" size="4" placeholder="" readonly />', '_____'
                        ),
                        '<input type="text"/>', '_____'
                    ),
                    '<input/>', '_____'
                ),
                '<input', '_____'
            ),
            '>', ''
        ),
        '<', ''
    ),
    '/>', '_____'
)
WHERE type = 'fill_blank' 
  AND content_html LIKE '%<input%'
  AND content NOT LIKE '%_____%';

-- 验证修复结果
SELECT id, content, content_html 
FROM questions 
WHERE type = 'fill_blank' 
LIMIT 10;
