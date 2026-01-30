import { useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAddButton } from '@/contexts/AddButtonContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStorage } from '@/hooks/useStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus, Check, Lightbulb, Save, BookmarkPlus, Edit, Settings } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const getCategoryDefaults = (t: any) => [
  { value: 'baby', label: t.shopping.baby, color: '#f0d4a8' },
  { value: 'food', label: t.shopping.food, color: '#c8dfe8' },
  { value: 'household', label: t.shopping.household, color: '#6b8e7f' },
  { value: 'health', label: t.shopping.health, color: '#d97b7b' },
  { value: 'other', label: t.shopping.other, color: '#e8e6e3' },
];

const getRandomColor = () => {
  const colors = ['#f0d4a8', '#c8dfe8', '#6b8e7f', '#d97b7b', '#e8e6e3', '#b4a7d6', '#f4a688', '#88c999'];
  return colors[Math.floor(Math.random() * colors.length)];
};

export default function Shopping() {
  const { 
    shoppingItems, shoppingTemplates,
    addShoppingItem, updateShoppingItem, deleteShoppingItem,
    addShoppingTemplate, deleteShoppingTemplate, applyShoppingTemplate,
    meals, recipes 
  } = useApp();
  const { setAddAction } = useAddButton();
  const { formatPrice } = useCurrency();
  const { t } = useLanguage();
  
  const DEFAULT_CATEGORIES = getCategoryDefaults(t);
  const [showForm, setShowForm] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    category: 'baby' as const,
    quantity: 1,
    price: 0,
    notes: '',
  });
  const [filter, setFilter] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useStorage<{value: string, label: string, color: string}[]>('shopping_custom_categories', []);
  const [hiddenDefaultCategories, setHiddenDefaultCategories] = useStorage<string[]>('shopping_hidden_default_categories', []);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  
  const VISIBLE_DEFAULT_CATEGORIES = DEFAULT_CATEGORIES.filter(cat => !hiddenDefaultCategories.includes(cat.value));
  const ALL_CATEGORIES = [...DEFAULT_CATEGORIES, ...customCategories];
  const CATEGORIES = [...VISIBLE_DEFAULT_CATEGORIES, ...customCategories];

  useEffect(() => {
    const addAction = () => {
      setShowForm(true);
    };
    setAddAction(addAction);
    return () => setAddAction(null);
  }, [setAddAction]);

  const handleSaveAsTemplate = () => {
    if (!templateName.trim() || shoppingItems.length === 0) return;

    const items = shoppingItems
      .filter(item => !item.completed)
      .map(item => ({
        name: item.name,
        category: item.category as 'baby' | 'food' | 'household' | 'health' | 'other',
        quantity: item.quantity,
      }));

    addShoppingTemplate({
      name: templateName,
      items,
    });

    setTemplateName('');
    setShowSaveTemplate(false);
  };

  // Get ingredient suggestions from upcoming meals
  const getIngredientSuggestions = () => {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingMeals = meals.filter(meal => {
      const mealDate = new Date(meal.date);
      return mealDate >= new Date() && mealDate <= nextWeek;
    });

    const suggestions: string[] = [];
    upcomingMeals.forEach(meal => {
      if (meal.recipeId) {
        const recipe = recipes.find(r => r.id === meal.recipeId);
        if (recipe?.ingredients) {
          recipe.ingredients.forEach(ingredient => {
            const ingredientLower = ingredient.toLowerCase();
            // Check if not already in shopping list
            const alreadyInList = shoppingItems.some(item => 
              item.name.toLowerCase().includes(ingredientLower) || 
              ingredientLower.includes(item.name.toLowerCase())
            );
            if (!alreadyInList && !suggestions.includes(ingredient)) {
              suggestions.push(ingredient);
            }
          });
        }
      }
    });

    return suggestions;
  };

  const suggestions = getIngredientSuggestions();

  const handleAddItem = () => {
    if (formData.name.trim()) {
      addShoppingItem({
        name: formData.name,
        category: formData.category,
        quantity: formData.quantity,
        price: formData.price,
        completed: false,
        notes: formData.notes,
      });
      setFormData({ name: '', category: 'baby', quantity: 1, price: 0, notes: '' });
      setShowForm(false);
    }
  };

  const handleStartEdit = (item: any) => {
    setEditingItem(item.id);
    setFormData({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      price: item.price,
      notes: item.notes || '',
    });
    setShowEditForm(true);
  };

  const handleEditItem = () => {
    if (formData.name.trim() && editingItem) {
      updateShoppingItem(editingItem, {
        name: formData.name,
        category: formData.category,
        quantity: formData.quantity,
        price: formData.price,
        notes: formData.notes,
      });
      setFormData({ name: '', category: 'baby', quantity: 1, price: 0, notes: '' });
      setEditingItem(null);
      setShowEditForm(false);
    }
  };

  const handleCancelEdit = () => {
    setFormData({ name: '', category: 'baby', quantity: 1, price: 0, notes: '' });
    setEditingItem(null);
    setShowEditForm(false);
  };

  const filteredItems = filter
    ? shoppingItems.filter(item => item.category === filter)
    : shoppingItems;

  const completedCount = filteredItems.filter(item => item.completed).length;
  const totalPrice = filteredItems
    .filter(item => !item.completed)
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  const getCategoryColor = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.color || '#e8e6e3';
  };

  const addCustomCategory = () => {
    if (!newCategoryName.trim()) return;

    const normalizedValue = newCategoryName.toLowerCase().replace(/\s+/g, '_');
    const isDefaultCategory = DEFAULT_CATEGORIES.some(c => c.value === normalizedValue);
    const alreadyExists = ALL_CATEGORIES.some(c => c.value === normalizedValue);

    if (isDefaultCategory) {
      if (hiddenDefaultCategories.includes(normalizedValue)) {
        setHiddenDefaultCategories(hiddenDefaultCategories.filter(value => value !== normalizedValue));
      }
      setFormData((prev) => ({ ...prev, category: normalizedValue as any }));
      setNewCategoryName('');
      setShowAddCategory(false);
      return;
    }

    if (!alreadyExists) {
      const newCategory = {
        value: normalizedValue,
        label: newCategoryName.trim(),
        color: getRandomColor()
      };
      setCustomCategories([...customCategories, newCategory]);
      setFormData((prev) => ({ ...prev, category: newCategory.value as any }));
      setNewCategoryName('');
      setShowAddCategory(false);
    }
  };

  const deleteCustomCategory = (categoryValue: string) => {
    // Check if category is used by existing items
    const isUsed = shoppingItems.some(item => item.category === categoryValue);
    const usageCount = shoppingItems.filter(item => item.category === categoryValue).length;
    
    if (isUsed) {
      alert(t.shopping.categoryInUseError.replace('{count}', usageCount.toString()));
      return;
    }

    const category = CATEGORIES.find(cat => cat.value === categoryValue);
    const categoryName = category ? category.label : categoryValue;
    const isDefault = DEFAULT_CATEGORIES.some(cat => cat.value === categoryValue);
    
    const message = isDefault 
      ? t.shopping.deleteDefaultConfirm.replace('{name}', categoryName)
      : t.shopping.deleteCustomConfirm.replace('{name}', categoryName);
    
    if (confirm(message)) {
      if (isDefault) {
        if (!hiddenDefaultCategories.includes(categoryValue)) {
          setHiddenDefaultCategories([...hiddenDefaultCategories, categoryValue]);
        }
      } else {
        setCustomCategories(customCategories.filter(cat => cat.value !== categoryValue));
      }

      if (filter === categoryValue) {
        setFilter(null);
      }

      if (formData.category === categoryValue) {
        const fallbackCategory = VISIBLE_DEFAULT_CATEGORIES[0]?.value || 'other';
        setFormData((prev) => ({ ...prev, category: fallbackCategory as any }));
      }
    }
  };

  const getCategoryLabel = (category: string) => {
    return CATEGORIES.find(c => c.value === category)?.label || category;
  };

  return (
    <div className="pb-24">
      <div className="sticky top-0 bg-background/95 backdrop-blur z-10 p-4 border-b border-border">
        <h1 className="text-3xl font-bold text-foreground mb-4">{t.shopping.title}</h1>
        
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Button
            onClick={() => setShowForm(true)}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t.shopping.add}
          </Button>
          
          <Button
            variant="outline"
            onClick={() => setShowManageCategories(true)}
            className="w-full"
          >
            <Settings className="w-4 h-4 mr-2" />
            {t.shopping.categories}
          </Button>
        </div>

        {true && (
          <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <BookmarkPlus className="w-4 h-4 mr-2" />
                  {t.shopping.templates} ({shoppingTemplates.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.shopping.myTemplates}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {shoppingTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {t.shopping.noTemplates}
                    </p>
                  ) : (
                    shoppingTemplates.map(template => (
                      <Card key={template.id} className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="font-medium">{template.name}</h3>
                            <p className="text-xs text-muted-foreground">
                              {template.items.length} {t.shopping.items}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(t.shopping.deleteTemplate)) {
                                deleteShoppingTemplate(template.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <Button
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            applyShoppingTemplate(template.id);
                            setShowTemplates(false);
                          }}
                        >
                          {t.shopping.applyTemplate}
                        </Button>
                      </Card>
                    ))
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}

        {suggestions.length > 0 && (
          <Dialog open={showSuggestions} onOpenChange={setShowSuggestions}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Lightbulb className="w-4 h-4 mr-2" />
                  {t.shopping.suggestions} ({suggestions.length})
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t.shopping.suggestedIngredients}</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <p className="text-sm text-muted-foreground mb-3">
                    {t.shopping.basedOnMeals}
                  </p>
                  {suggestions.map((suggestion, idx) => (
                    <Card key={idx} className="p-3 flex justify-between items-center">
                      <span>{suggestion}</span>
                      <Button
                        size="sm"
                        onClick={() => {
                          addShoppingItem({
                            name: suggestion,
                            category: 'food',
                            quantity: 1,
                            price: 0,
                            completed: false,
                            notes: '',
                          });
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </Card>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}

        {/* Gestion des catégories */}
        <Dialog open={showManageCategories} onOpenChange={setShowManageCategories}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t.shopping.manageCategories}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">{t.shopping.allCategories}</h3>
                  <span className="text-xs text-muted-foreground">{CATEGORIES.length} {t.shopping.categoriesCount}</span>
                </div>
                <div className="space-y-2">
                  {CATEGORIES.map(cat => {
                    const isUsed = shoppingItems.some(item => item.category === cat.value);
                    const usageCount = shoppingItems.filter(item => item.category === cat.value).length;
                    const isDefault = DEFAULT_CATEGORIES.some(defaultCat => defaultCat.value === cat.value);
                    return (
                      <div key={cat.value} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center gap-2 flex-1">
                          <div 
                            className="w-4 h-4 rounded" 
                            style={{ backgroundColor: cat.color }}
                          ></div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm">{cat.label}</span>
                              {isDefault && (
                                <span className="text-xs bg-gray-100 text-gray-700 px-1 rounded">{t.shopping.defaultCategory}</span>
                              )}
                            </div>
                            {isUsed && (
                              <div className="text-xs text-muted-foreground">
                                {usageCount} {t.shopping.items}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {isUsed && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{t.shopping.inUse}</span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteCustomCategory(cat.value)}
                            disabled={isUsed}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                            title={isUsed ? t.shopping.cannotDelete.replace('{count}', usageCount.toString()) : t.delete}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="border-t pt-4">
                {showAddCategory ? (
                  <div className="space-y-2">
                    <Input
                      placeholder={t.shopping.categoryNamePlaceholder}
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={addCustomCategory}
                        disabled={!newCategoryName.trim()}
                        className="flex-1"
                      >
                        {t.add}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                        className="flex-1"
                      >
                        {t.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAddCategory(true)}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {t.shopping.newCategory}
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            variant={filter === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(null)}
            className="whitespace-nowrap"
          >
            {t.shopping.all} ({shoppingItems.length})
          </Button>
          {CATEGORIES.map(cat => (
            <Button
              key={cat.value}
              variant={filter === cat.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(cat.value)}
              className="whitespace-nowrap"
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {totalPrice > 0 && (
          <div className="mt-3 text-sm text-muted-foreground">
            {t.shopping.totalAmount} : <span className="font-semibold text-foreground">{formatPrice(totalPrice)}</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">{t.shopping.noItems}</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <Card
              key={item.id}
              className={`p-4 transition-all ${item.completed ? 'opacity-60 bg-muted' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => updateShoppingItem(item.id, { completed: !item.completed })}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    item.completed
                      ? 'bg-primary border-primary'
                      : 'border-border hover:border-primary'
                  }`}
                >
                  {item.completed && <Check className="w-4 h-4 text-primary-foreground" />}
                </button>

                <div className="flex-1 min-w-0">
                  <h3 className={`font-medium ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.name}
                  </h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      style={{ backgroundColor: getCategoryColor(item.category) + '40' }}
                      className="text-xs"
                    >
                      {getCategoryLabel(item.category)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {t.shopping.qty}: {item.quantity}
                    </span>
                    {item.price > 0 && (
                      <span className="text-xs font-semibold text-foreground">
                        {formatPrice(item.price * item.quantity)}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <p className="text-xs text-muted-foreground mt-2">{item.notes}</p>
                  )}
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => handleStartEdit(item)}
                    className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteShoppingItem(item.id)}
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}

        {shoppingItems.filter(item => !item.completed).length > 0 && (
          <Dialog open={showSaveTemplate} onOpenChange={setShowSaveTemplate}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {t.shopping.saveAsTemplate}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t.shopping.createTemplate}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t.shopping.saveUnchecked.replace('{count}', shoppingItems.filter(item => !item.completed).length.toString())}
                </p>
                <div>
                  <label className="text-sm font-medium">{t.shopping.templateName}</label>
                  <Input
                    placeholder={t.shopping.templatePlaceholder}
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowSaveTemplate(false);
                      setTemplateName('');
                    }}
                    className="flex-1"
                  >
                    {t.cancel}
                  </Button>
                  <Button
                    onClick={handleSaveAsTemplate}
                    disabled={!templateName.trim()}
                    className="flex-1"
                  >
                    {t.save}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">{t.shopping.addItem}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">{t.shopping.itemName}</label>
              <Input
                placeholder={t.shopping.itemPlaceholder}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.shopping.category}</label>
                <div className="mt-1 space-y-2">
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                  {showAddCategory ? (
                    <div className="flex gap-2">
                      <Input
                        placeholder={t.shopping.categoryNamePlaceholder}
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        size="sm" 
                        onClick={addCustomCategory}
                        disabled={!newCategoryName.trim()}
                      >
                        {t.add}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }}
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowAddCategory(true)}
                      className="w-full"
                    >
                      + {t.shopping.newCategory}
                    </Button>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">{t.shopping.quantity}</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setFormData({ ...formData, quantity: isNaN(value) ? 0 : value });
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      setFormData({ ...formData, quantity: 1 });
                    }
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.shopping.price} (€)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.shopping.notes}</label>
              <Input
                placeholder={t.shopping.optionalNotes}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                {t.cancel}
              </Button>
              <Button
                onClick={handleAddItem}
                className="flex-1"
              >
                {t.add}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {showEditForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50">
          <Card className="w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold">{t.shopping.editItem}</h2>

            <div>
              <label className="text-sm font-medium text-foreground">{t.shopping.itemName}</label>
              <Input
                placeholder={t.shopping.itemPlaceholder}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">{t.shopping.category}</label>
                <div className="mt-1 space-y-2">
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground">{t.shopping.quantity}</label>
                <Input
                  type="number"
                  min="1"
                  value={formData.quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setFormData({ ...formData, quantity: isNaN(value) ? 0 : value });
                  }}
                  onBlur={(e) => {
                    if (!e.target.value || parseInt(e.target.value) < 1) {
                      setFormData({ ...formData, quantity: 1 });
                    }
                  }}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.shopping.price} (€)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t.shopping.notes}</label>
              <Input
                placeholder={t.shopping.optionalNotes}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="mt-1"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={handleCancelEdit}
                className="flex-1"
              >
                {t.cancel}
              </Button>
              <Button
                onClick={handleEditItem}
                className="flex-1"
              >
                {t.save}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
