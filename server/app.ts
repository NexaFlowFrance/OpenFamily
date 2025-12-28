import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';

// Types
interface Family {
  id: string;
  name: string;
  created_at: Date;
}

interface FamilyMember {
  id: string;
  family_id: string;
  name: string;
  color: string;
  health_info: any;
  created_at: Date;
}

interface ShoppingItem {
  id: string;
  family_id: string;
  name: string;
  quantity: number;
  category: string;
  checked: boolean;
  assigned_to?: string;
  created_at: Date;
}

interface Task {
  id: string;
  family_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to?: string;
  due_date?: Date;
  created_at: Date;
}

interface Appointment {
  id: string;
  family_id: string;
  title: string;
  date: Date;
  time: string;
  location?: string;
  description?: string;
  members: string[];
  created_at: Date;
}

interface Recipe {
  id: string;
  family_id: string;
  name: string;
  category: string;
  prep_time: number;
  cook_time: number;
  servings: number;
  ingredients: any[];
  instructions: string[];
  image_url?: string;
  created_at: Date;
}

interface Meal {
  id: string;
  family_id: string;
  date: Date;
  type: string;
  recipe_id?: string;
  notes?: string;
  created_at: Date;
}

interface Budget {
  id: string;
  family_id: string;
  category: string;
  amount: number;
  spent: number;
  month: string;
  created_at: Date;
}

interface FamilyConfiguration {
  id: string;
  family_id: string;
  onboarding_completed: boolean;
  storage_mode: string;
  theme: string;
  language: string;
  created_at: Date;
  updated_at: Date;
}

// Middleware d'authentification simple
const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const authToken = req.headers.authorization?.replace('Bearer ', '');
  
  if (!authToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Ici, vous pouvez valider le token (JWT, etc.)
  // Pour l'instant, on accepte tous les tokens non-vides
  next();
};

// Middleware pour extraire le family_id
const familyMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const familyId = req.headers['x-family-id'] as string;
  
  if (!familyId) {
    return res.status(400).json({ error: 'Family ID required' });
  }

  (req as any).familyId = familyId;
  next();
};

export function createApp(pool: Pool) {
  const app = express();

  // Middlewares
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes protégées
  app.use('/api', authMiddleware);
  app.use('/api', familyMiddleware);

  // ===== Shopping Items =====
  app.get('/api/shopping-items', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM shopping_items WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching shopping items:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/shopping-items', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, name, quantity, category, checked, assigned_to } = req.body;
      
      const result = await pool.query(
        'INSERT INTO shopping_items (id, family_id, name, quantity, category, checked, assigned_to) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [id, familyId, name, quantity, category, checked, assigned_to]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating shopping item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/shopping-items/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { name, quantity, category, checked, assigned_to } = req.body;
      
      const result = await pool.query(
        'UPDATE shopping_items SET name = $1, quantity = $2, category = $3, checked = $4, assigned_to = $5 WHERE id = $6 AND family_id = $7 RETURNING *',
        [name, quantity, category, checked, assigned_to, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Shopping item not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating shopping item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/shopping-items/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM shopping_items WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Shopping item not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting shopping item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Tasks =====
  app.get('/api/tasks', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM tasks WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, title, description, priority, status, assigned_to, due_date } = req.body;
      
      const result = await pool.query(
        'INSERT INTO tasks (id, family_id, title, description, priority, status, assigned_to, due_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [id, familyId, title, description, priority, status, assigned_to, due_date]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/tasks/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { title, description, priority, status, assigned_to, due_date } = req.body;
      
      const result = await pool.query(
        'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, assigned_to = $5, due_date = $6 WHERE id = $7 AND family_id = $8 RETURNING *',
        [title, description, priority, status, assigned_to, due_date, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/tasks/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM tasks WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Appointments =====
  app.get('/api/appointments', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM appointments WHERE family_id = $1 ORDER BY date DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/appointments', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, title, date, time, location, description, members } = req.body;
      
      const result = await pool.query(
        'INSERT INTO appointments (id, family_id, title, date, time, location, description, members) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [id, familyId, title, date, time, location, description, JSON.stringify(members)]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/appointments/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { title, date, time, location, description, members } = req.body;
      
      const result = await pool.query(
        'UPDATE appointments SET title = $1, date = $2, time = $3, location = $4, description = $5, members = $6 WHERE id = $7 AND family_id = $8 RETURNING *',
        [title, date, time, location, description, JSON.stringify(members), id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/appointments/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM appointments WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Family Members =====
  app.get('/api/members', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM family_members WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching members:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/members', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, name, color, health_info } = req.body;
      
      const result = await pool.query(
        'INSERT INTO family_members (id, family_id, name, color, health_info) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [id, familyId, name, color, JSON.stringify(health_info)]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/members/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { name, color, health_info } = req.body;
      
      const result = await pool.query(
        'UPDATE family_members SET name = $1, color = $2, health_info = $3 WHERE id = $4 AND family_id = $5 RETURNING *',
        [name, color, JSON.stringify(health_info), id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/members/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM family_members WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Member not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Recipes =====
  app.get('/api/recipes', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM recipes WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching recipes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/recipes', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, name, category, prep_time, cook_time, servings, ingredients, instructions, image_url } = req.body;
      
      const result = await pool.query(
        'INSERT INTO recipes (id, family_id, name, category, prep_time, cook_time, servings, ingredients, instructions, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [id, familyId, name, category, prep_time, cook_time, servings, JSON.stringify(ingredients), JSON.stringify(instructions), image_url]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating recipe:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/recipes/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { name, category, prep_time, cook_time, servings, ingredients, instructions, image_url } = req.body;
      
      const result = await pool.query(
        'UPDATE recipes SET name = $1, category = $2, prep_time = $3, cook_time = $4, servings = $5, ingredients = $6, instructions = $7, image_url = $8 WHERE id = $9 AND family_id = $10 RETURNING *',
        [name, category, prep_time, cook_time, servings, JSON.stringify(ingredients), JSON.stringify(instructions), image_url, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Recipe not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating recipe:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/recipes/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM recipes WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Recipe not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting recipe:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Meals =====
  app.get('/api/meals', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM meals WHERE family_id = $1 ORDER BY date DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching meals:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/meals', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, date, type, recipe_id, notes } = req.body;
      
      const result = await pool.query(
        'INSERT INTO meals (id, family_id, date, type, recipe_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, familyId, date, type, recipe_id, notes]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating meal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/meals/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { date, type, recipe_id, notes } = req.body;
      
      const result = await pool.query(
        'UPDATE meals SET date = $1, type = $2, recipe_id = $3, notes = $4 WHERE id = $5 AND family_id = $6 RETURNING *',
        [date, type, recipe_id, notes, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Meal not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating meal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/meals/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM meals WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Meal not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting meal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Budgets =====
  app.get('/api/budgets', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM budgets WHERE family_id = $1 ORDER BY month DESC',
        [familyId]
      );
      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/budgets', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, category, amount, spent, month } = req.body;
      
      const result = await pool.query(
        'INSERT INTO budgets (id, family_id, category, amount, spent, month) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [id, familyId, category, amount, spent, month]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating budget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/api/budgets/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { category, amount, spent, month } = req.body;
      
      const result = await pool.query(
        'UPDATE budgets SET category = $1, amount = $2, spent = $3, month = $4 WHERE id = $5 AND family_id = $6 RETURNING *',
        [category, amount, spent, month, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Budget not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating budget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/budgets/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      const result = await pool.query(
        'DELETE FROM budgets WHERE id = $1 AND family_id = $2 RETURNING id',
        [id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Budget not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting budget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Family Configuration =====
  app.get('/api/family/config', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM family_configuration WHERE family_id = $1',
        [familyId]
      );
      
      if (result.rows.length === 0) {
        // Retourner une config par défaut si elle n'existe pas
        return res.json({
          family_id: familyId,
          onboarding_completed: false,
          storage_mode: 'local',
          theme: 'light',
          language: 'fr'
        });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching family configuration:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/family/config', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, onboarding_completed, storage_mode, theme, language } = req.body;
      
      // Upsert: INSERT avec ON CONFLICT UPDATE
      const result = await pool.query(
        `INSERT INTO family_configuration (id, family_id, onboarding_completed, storage_mode, theme, language, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (family_id)
         DO UPDATE SET 
           onboarding_completed = EXCLUDED.onboarding_completed,
           storage_mode = EXCLUDED.storage_mode,
           theme = EXCLUDED.theme,
           language = EXCLUDED.language,
           updated_at = NOW()
         RETURNING *`,
        [id, familyId, onboarding_completed, storage_mode, theme, language]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error saving family configuration:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
