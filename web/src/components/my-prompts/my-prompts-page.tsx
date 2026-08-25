"use client";

import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { App, Button, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Copy, FolderPlus, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";

import { useAssetStore } from "@/stores/use-asset-store";
import { useCopyText } from "@/hooks/use-copy-text";
import { createMyPrompt, deleteMyPrompt, listMyPrompts, updateMyPrompt } from "@/services/api/my-prompts";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

const PAGE_SIZE = 8;

type PromptFormValue = {
    title: string;
    prompt: string;
    category?: string;
    tags?: string;
    coverUrl?: string;
    preview?: string;
};

export function MyPromptsPage() {
    const { message } = App.useApp();
    const [form] = Form.useForm<PromptFormValue>();
    const requestIdRef = useRef(0);
    const [items, setItems] = useState<Prompt[]>([]);
    const [categories, setCategories] = useState([ALL_PROMPTS_OPTION]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [keyword, setKeyword] = useState("");
    const [category, setCategory] = useState(ALL_PROMPTS_OPTION);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState("");
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<Prompt>();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const deferredKeyword = useDeferredValue(keyword.trim());
    const hasFilters = Boolean(keyword.trim()) || category !== ALL_PROMPTS_OPTION;

    const loadPrompts = useCallback(
        async (targetPage: number) => {
            const requestId = ++requestIdRef.current;
            setLoading(true);
            try {
                const payload = await listMyPrompts({ page: targetPage, pageSize: PAGE_SIZE, keyword: deferredKeyword, category });
                if (requestId !== requestIdRef.current) return;
                setItems(payload.items);
                setTotal(payload.total);
                setCategories([ALL_PROMPTS_OPTION, ...payload.categories.filter((item) => item !== ALL_PROMPTS_OPTION)]);
            } catch (error) {
                if (requestId === requestIdRef.current) message.error(error instanceof Error ? error.message : "获取我的提示词失败");
            } finally {
                if (requestId === requestIdRef.current) setLoading(false);
            }
        },
        [category, deferredKeyword, message],
    );

    useEffect(() => {
        void loadPrompts(page);
    }, [loadPrompts, page]);

    const savePrompt = async (value: PromptFormValue) => {
        setSubmitting(true);
        try {
            const input = { ...value, tags: splitTags(value.tags) };
            if (editingPrompt) await updateMyPrompt(editingPrompt.id, input);
            else await createMyPrompt(input);
            form.resetFields();
            setEditorOpen(false);
            message.success(editingPrompt ? "提示词已更新" : "提示词已保存");
            if (page === 1) await loadPrompts(1);
            else setPage(1);
        } catch (error) {
            message.error(error instanceof Error ? error.message : editingPrompt ? "更新提示词失败" : "新增提示词失败");
        } finally {
            setSubmitting(false);
        }
    };

    const openCreate = () => {
        setEditingPrompt(undefined);
        setEditorOpen(true);
    };

    const openEdit = (prompt: Prompt) => {
        setEditingPrompt(prompt);
        setEditorOpen(true);
    };

    const closeEditor = () => {
        if (submitting) return;
        setEditorOpen(false);
    };

    const deletePrompt = async (id: string) => {
        setDeletingId(id);
        try {
            await deleteMyPrompt(id);
            message.success("提示词已删除");
            const targetPage = Math.min(page, Math.max(1, Math.ceil(Math.max(0, total - 1) / PAGE_SIZE)));
            if (targetPage === page) await loadPrompts(targetPage);
            else setPage(targetPage);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除提示词失败");
        } finally {
            setDeletingId("");
        }
    };

    const savePromptAsset = async (item: Prompt) => {
        try {
            await addAsset({ kind: "text", title: item.title, coverUrl: item.coverUrl, tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "my-prompts", promptId: item.id } });
            message.success("已加入我的素材");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材保存失败");
        }
    };

    const columns: TableColumnsType<Prompt> = [
        {
            title: "标题",
            dataIndex: "title",
            render: (_, record) => (
                <div className="min-w-0">
                    <div className="font-medium text-stone-950 dark:text-stone-100">{record.title}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{record.prompt}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                        {record.tags.map((tag) => (
                            <Tag key={tag} className="m-0 text-[11px]">
                                {tag}
                            </Tag>
                        ))}
                    </div>
                </div>
            ),
        },
        {
            title: "分类",
            dataIndex: "category",
            width: 120,
            responsive: ["md"],
        },
        {
            title: "操作",
            width: 216,
            render: (_, record) => (
                <Space wrap size="small">
                    <Button size="small" aria-label="复制提示词" icon={<Copy className="size-3.5" />} onClick={() => copyText(record.prompt, "提示词已复制")}>
                        <span className="hidden sm:inline">复制</span>
                    </Button>
                    <Button size="small" aria-label="加入我的素材" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(record)}>
                        <span className="hidden sm:inline">素材</span>
                    </Button>
                    <Button size="small" aria-label="编辑提示词" title="编辑提示词" icon={<Pencil className="size-3.5" />} onClick={() => openEdit(record)} />
                    <Popconfirm title="删除提示词？" okText="删除" cancelText="取消" onConfirm={() => deletePrompt(record.id)}>
                        <Button size="small" danger aria-label="删除提示词" loading={deletingId === record.id} icon={<Trash2 className="size-3.5" />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div className="bg-background px-3 py-3 text-stone-800 sm:px-6 sm:py-5 dark:text-stone-100">
            <div className="mx-auto max-w-7xl">
                <section className="grid min-w-0 grid-cols-2 gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(240px,1fr)_180px_auto_auto] sm:items-center sm:pb-4">
                    <Input
                        allowClear
                        className="col-span-2 !h-9 sm:col-span-1"
                        prefix={<Search className="size-4 text-stone-400" />}
                        value={keyword}
                        placeholder="搜索我的提示词"
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                    <Select
                        aria-label="我的提示词分类"
                        className="min-w-0"
                        value={category}
                        options={categories.map((item) => ({ label: item, value: item }))}
                        onChange={(value) => {
                            setCategory(value);
                            setPage(1);
                        }}
                    />
                    <div className="flex min-h-8 items-center justify-between gap-1 sm:justify-end">
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">共 {total} 条</span>
                        <Button
                            aria-label="清除我的提示词筛选"
                            icon={<RotateCcw className="size-3.5" />}
                            disabled={!hasFilters}
                            onClick={() => {
                                setKeyword("");
                                setCategory(ALL_PROMPTS_OPTION);
                                setPage(1);
                            }}
                        />
                    </div>
                    <Button className="col-span-2 sm:col-span-1" type="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
                        添加提示词
                    </Button>
                </section>

                <section className="mt-3 overflow-hidden border-y border-border bg-card sm:mt-4 sm:rounded-lg sm:border">
                    <Table
                        className="[&_.ant-table-tbody>tr>td]:!py-2 sm:[&_.ant-table-tbody>tr>td]:!py-3 [&_.ant-table-thead>tr>th]:!py-2"
                        rowKey="id"
                        loading={loading}
                        columns={columns}
                        dataSource={items}
                        tableLayout="fixed"
                        pagination={{ current: page, pageSize: PAGE_SIZE, total, hideOnSinglePage: true, showSizeChanger: false, size: "small", onChange: setPage }}
                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hasFilters ? "没有找到匹配的提示词" : "还没有保存提示词"} /> }}
                    />
                </section>
            </div>
            <Modal
                title={editingPrompt ? "编辑提示词" : "添加提示词"}
                open={editorOpen}
                footer={null}
                centered
                width={720}
                destroyOnHidden
                onCancel={closeEditor}
                afterOpenChange={(open) => {
                    if (!open) {
                        setEditingPrompt(undefined);
                        return;
                    }
                    if (!editingPrompt) {
                        form.resetFields();
                        return;
                    }
                    form.setFieldsValue({
                        title: editingPrompt.title,
                        prompt: editingPrompt.prompt,
                        category: editingPrompt.category,
                        tags: editingPrompt.tags.join(", "),
                        coverUrl: editingPrompt.coverUrl || undefined,
                        preview: editingPrompt.preview || undefined,
                    });
                }}
            >
                <Form form={form} layout="vertical" onFinish={savePrompt} requiredMark={false} className="pt-3">
                    <div className="grid gap-x-4 sm:grid-cols-2">
                        <Form.Item label="标题" name="title" rules={[{ required: true, message: "请输入标题" }]}>
                            <Input placeholder="例如：产品摄影主视觉" />
                        </Form.Item>
                        <Form.Item label="分类" name="category">
                            <Input placeholder="例如：商业海报" />
                        </Form.Item>
                        <Form.Item label="标签" name="tags">
                            <Input placeholder="用逗号分隔，例如：摄影, 电商, 写实" />
                        </Form.Item>
                        <Form.Item label="封面 URL" name="coverUrl">
                            <Input placeholder="可选，用于展示卡片封面" />
                        </Form.Item>
                    </div>
                    <Form.Item label="提示词内容" name="prompt" rules={[{ required: true, message: "请输入提示词内容" }]}>
                        <Input.TextArea rows={5} placeholder="输入完整提示词..." />
                    </Form.Item>
                    <Form.Item label="备注 / 预览" name="preview">
                        <Input.TextArea rows={2} placeholder="可选，记录使用场景、参考图说明或效果备注" />
                    </Form.Item>
                    <div className="flex justify-end gap-3">
                        <Button onClick={closeEditor}>取消</Button>
                        <Button type="primary" htmlType="submit" loading={submitting} icon={editingPrompt ? <Pencil className="size-4" /> : <Plus className="size-4" />}>
                            {editingPrompt ? "保存修改" : "保存提示词"}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}

function splitTags(value?: string) {
    return (value || "")
        .split(/[,，\n]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}
