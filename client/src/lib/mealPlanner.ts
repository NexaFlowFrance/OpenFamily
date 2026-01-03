import { Recipe } from '@/types';
import { formatDateOnly } from '@/lib/dateOnly';

interface MealSuggestion {
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  recipeId: string;
  recipeName: string;
}

export const generateWeeklyMealPlan = (
  recipes: Recipe[],
  existingMeals: Array<{ date: string; mealType: string; recipeId?: string }>,
  startDate: Date
): MealSuggestion[] => {
  const suggestions: MealSuggestion[] = [];
  const usedRecipeIds = new Set<string>();

  // Filtrer les recettes par catégorie
  const breakfastRecipes = recipes.filter(r => r.category === 'snack');
  const lunchRecipes = recipes.filter(r => r.category === 'main' || r.category === 'starter');
  const dinnerRecipes = recipes.filter(r => r.category === 'main');
  const snackRecipes = recipes.filter(r => r.category === 'snack' || r.category === 'dessert');

  // Générer pour 7 jours
  for (let day = 0; day < 7; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);
    const dateStr = formatDateOnly(currentDate);

    // Vérifier si des repas existent déjà pour ce jour
    const existingDayMeals = existingMeals.filter(m => m.date === dateStr);

    // Petit-déjeuner
    if (!existingDayMeals.some(m => m.mealType === 'breakfast') && breakfastRecipes.length > 0) {
      const recipe = getRandomRecipe(breakfastRecipes, usedRecipeIds);
      if (recipe) {
        suggestions.push({
          mealType: 'breakfast',
          recipeId: recipe.id,
          recipeName: recipe.title,
        });
        usedRecipeIds.add(recipe.id);
      }
    }

    // Déjeuner
    if (!existingDayMeals.some(m => m.mealType === 'lunch') && lunchRecipes.length > 0) {
      const recipe = getRandomRecipe(lunchRecipes, usedRecipeIds);
      if (recipe) {
        suggestions.push({
          mealType: 'lunch',
          recipeId: recipe.id,
          recipeName: recipe.title,
        });
        usedRecipeIds.add(recipe.id);
      }
    }

    // Dîner
    if (!existingDayMeals.some(m => m.mealType === 'dinner') && dinnerRecipes.length > 0) {
      const recipe = getRandomRecipe(dinnerRecipes, usedRecipeIds);
      if (recipe) {
        suggestions.push({
          mealType: 'dinner',
          recipeId: recipe.id,
          recipeName: recipe.title,
        });
        usedRecipeIds.add(recipe.id);
      }
    }

    // Reset après quelques jours pour permettre la répétition
    if (day % 3 === 0) {
      usedRecipeIds.clear();
    }
  }

  return suggestions;
};

const getRandomRecipe = (recipes: Recipe[], usedIds: Set<string>): Recipe | null => {
  const availableRecipes = recipes.filter(r => !usedIds.has(r.id));
  if (availableRecipes.length === 0) {
    // Si tous ont été utilisés, réinitialiser
    return recipes[Math.floor(Math.random() * recipes.length)];
  }
  return availableRecipes[Math.floor(Math.random() * availableRecipes.length)];
};
