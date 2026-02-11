import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Plus, Trash2, Check, ShoppingBag, Save, ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

interface ShoppingItem {
    id: string;
    name: string;
    category: string;
    quantity?: number;
    unit?: string;
    price?: number;
    is_checked: boolean;
    notes?: string;
}

interface ShoppingTemplate {
    id: string;
    name: string;
    items: Array<{
        name: string;
        category: string;
        quantity?: number;
        unit?: string;
        price?: number;
        notes?: string;
    }>;
}

const categories = ['Alimentation', 'Bebe', 'Menage', 'Sante', 'Autre'];

const parseOptionalPositiveNumber = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const ShoppingList: React.FC = () => {
    const [items, setItems] = useState<ShoppingItem[]>([]);
    const [templates, setTemplates] = useState<ShoppingTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateName, setTemplateName] = useState('');
    const [newItem, setNewItem] = useState({
        name: '',
        category: 'Alimentation',
        quantity: '',
        price: '',
        unit: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        void Promise.all([loadItems(), loadTemplates()]).finally(() => setLoading(false));
    }, []);

    const loadItems = async () => {
        try {
            const response = await api.get<{ success: boolean; data: ShoppingItem[] }>('/api/shopping');
            if (response.success) {
                setItems(response.data);
            }
        } catch (err) {
            console.error('Failed to load shopping items:', err);
            setError(err instanceof Error ? err.message : 'Impossible de charger la liste de courses.');
        }
    };

    const loadTemplates = async () => {
        try {
            const response = await api.get<{ success: boolean; data: ShoppingTemplate[] }>('/api/shopping/templates');
            if (response.success) {
                setTemplates(response.data);
            }
        } catch (err) {
            console.error('Failed to load templates:', err);
            setError(err instanceof Error ? err.message : 'Impossible de charger les templates.');
        }
    };

    const addItem = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!newItem.name.trim()) {
            setError('Le nom de l article est obligatoire.');
            return;
        }

        const quantity = parseOptionalPositiveNumber(newItem.quantity);
        const price = parseOptionalPositiveNumber(newItem.price);

        if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
            setError('La quantite doit etre un nombre positif.');
            return;
        }

        if (price !== undefined && (!Number.isFinite(price) || price < 0)) {
            setError('Le prix doit etre un nombre valide.');
            return;
        }

        try {
            const response = await api.post<{ success: boolean; data: ShoppingItem }>('/api/shopping', {
                name: newItem.name,
                category: newItem.category,
                quantity,
                price,
                unit: newItem.unit || null,
            });

            if (response.success) {
                setItems((prev) => [response.data, ...prev]);
                setNewItem({ name: '', category: 'Alimentation', quantity: '', price: '', unit: '' });
            }
        } catch (err) {
            console.error('Failed to add item:', err);
            setError(err instanceof Error ? err.message : 'Impossible d ajouter cet article.');
        }
    };

    const toggleItem = async (item: ShoppingItem) => {
        setError('');
        try {
            const response = await api.put<{ success: boolean; data: ShoppingItem }>(`/api/shopping/${item.id}`, {
                is_checked: !item.is_checked,
            });
            if (response.success) {
                setItems((prev) => prev.map((current) => (current.id === item.id ? response.data : current)));
            }
        } catch (err) {
            console.error('Failed to toggle item:', err);
            setError(err instanceof Error ? err.message : 'Impossible de mettre a jour cet article.');
        }
    };

    const deleteItem = async (id: string) => {
        setError('');
        try {
            await api.delete(`/api/shopping/${id}`);
            setItems((prev) => prev.filter((item) => item.id !== id));
        } catch (err) {
            console.error('Failed to delete item:', err);
            setError(err instanceof Error ? err.message : 'Impossible de supprimer cet article.');
        }
    };

    const clearCheckedItems = async () => {
        setError('');
        try {
            await api.delete('/api/shopping/checked/clear');
            setItems((prev) => prev.filter((item) => !item.is_checked));
        } catch (err) {
            console.error('Failed to clear checked items:', err);
            setError(err instanceof Error ? err.message : 'Impossible de vider les articles coches.');
        }
    };

    const saveTemplate = async () => {
        setError('');
        const name = templateName.trim();
        if (!name) {
            setError('Donnez un nom au template.');
            return;
        }

        const templateItems = items
            .filter((item) => !item.is_checked)
            .map((item) => ({
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                notes: item.notes,
            }));

        if (templateItems.length === 0) {
            setError('Aucun article non coche a enregistrer dans le template.');
            return;
        }

        try {
            await api.post('/api/shopping/templates', {
                name,
                items: templateItems,
            });
            setTemplateName('');
            await loadTemplates();
        } catch (err) {
            console.error('Failed to save template:', err);
            setError(err instanceof Error ? err.message : 'Impossible d enregistrer le template.');
        }
    };

    const applyTemplate = async () => {
        setError('');
        if (!selectedTemplateId) {
            setError('Selectionnez un template a appliquer.');
            return;
        }

        try {
            await api.post(`/api/shopping/templates/${selectedTemplateId}/apply`, {});
            await loadItems();
        } catch (err) {
            console.error('Failed to apply template:', err);
            setError(err instanceof Error ? err.message : 'Impossible d appliquer ce template.');
        }
    };

    const deleteTemplate = async () => {
        setError('');
        if (!selectedTemplateId) {
            setError('Selectionnez un template a supprimer.');
            return;
        }

        try {
            await api.delete(`/api/shopping/templates/${selectedTemplateId}`);
            setSelectedTemplateId('');
            await loadTemplates();
        } catch (err) {
            console.error('Failed to delete template:', err);
            setError(err instanceof Error ? err.message : 'Impossible de supprimer ce template.');
        }
    };

    const pendingItems = useMemo(() => items.filter((item) => !item.is_checked), [items]);
    const completedItems = useMemo(() => items.filter((item) => item.is_checked), [items]);

    const totalPrice = useMemo(() => {
        return pendingItems.reduce((sum, item) => {
            const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;
            const price = item.price || 0;
            return sum + quantity * price;
        }, 0);
    }, [pendingItems]);

    if (loading) {
        return (
            <div className="flex h-full min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="spinner-brand" />
                    <p className="animate-pulse font-medium text-muted-foreground">Chargement de votre liste...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            {error ? (
                <div className="rounded-input border border-danger/30 bg-danger/10 px-4 py-3 text-caption text-danger">
                    {error}
                </div>
            ) : null}

            <div className="flex items-center gap-3">
                <div className="rounded-card bg-primary-soft p-3 text-primary">
                    <ShoppingBag className="h-7 w-7" />
                </div>
                <div>
                    <h1 className="text-h1 text-foreground">Liste de courses</h1>
                    <p className="text-body text-muted-foreground">{pendingItems.length} articles restants</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Ajouter un article</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={addItem} className="grid grid-cols-1 gap-4 md:grid-cols-8">
                        <div className="md:col-span-3">
                            <Input
                                label="Nom"
                                type="text"
                                value={newItem.name}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, name: e.target.value }))}
                                placeholder="Ex: Lait, Pain"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-caption font-medium text-foreground">Categorie</label>
                            <select
                                value={newItem.category}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, category: e.target.value }))}
                                className="input-nexus py-0 text-caption"
                            >
                                {categories.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Input
                                label="Qt"
                                type="number"
                                min="0"
                                step="0.1"
                                value={newItem.quantity}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, quantity: e.target.value }))}
                                placeholder="1"
                            />
                        </div>
                        <div>
                            <Input
                                label="Prix"
                                type="number"
                                min="0"
                                step="0.01"
                                value={newItem.price}
                                onChange={(e) => setNewItem((prev) => ({ ...prev, price: e.target.value }))}
                                placeholder="2.50"
                            />
                        </div>
                        <div className="md:col-span-8 flex justify-end">
                            <Button type="submit">
                                <Plus className="mr-1 h-4 w-4" />
                                Ajouter
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-primary" />
                        Templates de courses
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Input
                            label="Nouveau template"
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="Ex: Courses semaine"
                        />
                        <div className="md:col-span-2 flex items-end gap-2">
                            <Button variant="secondary" className="w-full md:w-auto" onClick={saveTemplate}>
                                <Save className="mr-1 h-4 w-4" />
                                Enregistrer la liste courante
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="md:col-span-2">
                            <label className="mb-1.5 block text-caption font-medium text-foreground">Template existant</label>
                            <select
                                value={selectedTemplateId}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                className="input-nexus py-0 text-caption"
                            >
                                <option value="">Selectionner un template</option>
                                {templates.map((template) => (
                                    <option key={template.id} value={template.id}>
                                        {template.name} ({template.items?.length || 0} articles)
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end gap-2">
                            <Button variant="secondary" className="flex-1" onClick={applyTemplate}>
                                Appliquer
                            </Button>
                            <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={deleteTemplate}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {pendingItems.length === 0 && completedItems.length === 0 ? (
                    <div className="rounded-card border border-dashed border-border bg-card py-16 text-center">
                        <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                        <h3 className="text-body font-semibold text-foreground">Votre liste est vide</h3>
                        <p className="text-caption text-muted-foreground">Ajoutez des articles ou appliquez un template.</p>
                    </div>
                ) : (
                    <>
                        {pendingItems.map((item) => (
                            <div
                                key={item.id}
                                className="group flex items-center gap-4 rounded-card border border-border bg-card p-4 shadow-surface transition-all duration-fast ease-soft hover:border-border-strong"
                            >
                                <button
                                    type="button"
                                    onClick={() => toggleItem(item)}
                                    className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-input"
                                >
                                    {item.is_checked ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                                </button>

                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-body font-medium text-foreground">{item.name}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-micro">
                                        <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-primary">{item.category}</span>
                                        {item.quantity ? <span className="text-muted-foreground">Qt: {item.quantity}</span> : null}
                                        {item.price ? <span className="text-muted-foreground">{item.price.toFixed(2)} EUR</span> : null}
                                    </div>
                                </div>

                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteItem(item.id)}
                                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}

                        {completedItems.length > 0 ? (
                            <div className="rounded-card border border-dashed border-border bg-muted/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <p className="text-caption font-medium text-muted-foreground">Articles coches ({completedItems.length})</p>
                                    <Button variant="ghost" size="sm" onClick={clearCheckedItems}>
                                        Nettoyer
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {completedItems.map((item) => (
                                        <div
                                            key={item.id}
                                            className="flex items-center gap-3 rounded-input border border-border bg-card px-3 py-2"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleItem(item)}
                                                className="flex h-5 w-5 items-center justify-center rounded border border-primary bg-primary"
                                            >
                                                <Check className="h-3 w-3 text-white" />
                                            </button>
                                            <p className="line-through text-caption text-muted-foreground">{item.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </>
                )}
            </div>

            <div className="sticky bottom-20 z-20 rounded-card border border-border bg-card px-4 py-3 shadow-surface lg:bottom-4">
                <div className="flex items-center justify-between text-caption">
                    <span className="text-muted-foreground">Total estime</span>
                    <span className="text-body font-semibold text-foreground">{totalPrice.toFixed(2)} EUR</span>
                </div>
            </div>
        </div>
    );
};

export default ShoppingList;
