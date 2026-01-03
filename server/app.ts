import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createPushRoutes } from './pushRoutes.js';

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

// Helper functions to map between DB (snake_case) and client (camelCase)
function mapRecipeToClient(dbRecipe: any) {
  return {
    id: dbRecipe.id,
    title: dbRecipe.name,
    description: dbRecipe.description,
    category: dbRecipe.category,
    prepTime: dbRecipe.prep_time,
    cookTime: dbRecipe.cook_time,
    servings: dbRecipe.servings,
    ingredients: dbRecipe.ingredients,
    instructions: Array.isArray(dbRecipe.instructions) ? dbRecipe.instructions.join('\n') : dbRecipe.instructions,
    image: dbRecipe.image_url,
    createdAt: dbRecipe.created_at
  };
}

function mapMealToClient(dbMeal: any) {
  return {
    id: dbMeal.id,
    date: dbMeal.date instanceof Date ? dbMeal.date.toISOString().split('T')[0] : dbMeal.date,
    mealType: dbMeal.type,
    recipeId: dbMeal.recipe_id,
    title: dbMeal.notes || '',
    notes: dbMeal.notes,
    createdAt: dbMeal.created_at
  };
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

  // Security middlewares
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", "ws:", "wss:"],
        frameAncestors: ["'self'"]
      }
    }
  }));

  // Rate limiting disabled for development/Docker
  // const limiter = rateLimit({
  //   windowMs: 15 * 60 * 1000,
  //   max: 100,
  //   message: 'Too many requests from this IP, please try again later.',
  //   standardHeaders: true,
  //   legacyHeaders: false,
  // });
  // app.use(limiter);
  
  // CORS and body parsing
  app.use(cors());
  app.use(express.json({ limit: '10mb' })); // Limit JSON payload size
  
  // Helper pour notifier via WebSocket
  const notifySync = (req: any, entity: string, action: 'create' | 'update' | 'delete', data?: any) => {
    const wsServer = (req.app as any).wsServer;
    if (wsServer && req.familyId) {
      wsServer.notifyFamily(req.familyId, { type: 'sync', entity, action, data });
    }
  };

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ===== Push Notifications (AVANT auth middleware) =====
  app.use('/push', createPushRoutes(pool));

  // Routes protégées - appliqués à toutes les routes sauf /health et /push
  app.use(authMiddleware);
  app.use(familyMiddleware);

  // ===== Shopping Items =====
  app.get('/shopping-items', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM shopping_items WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      
      // Map DB data to client format
      const items = result.rows.map(row => ({
        ...row,
        completed: row.checked,
        createdAt: row.created_at,
        price: parseFloat(row.price) || 0,
        notes: row.notes || ''
      }));
      
      // Remove DB properties
      items.forEach(item => {
        delete item.checked;
        delete item.created_at;
      });
      
      res.json(items);
    } catch (error) {
      console.error('Error fetching shopping items:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/shopping-items', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { name, quantity, category, completed, assigned_to, price, notes } = req.body;
      
      // Mapper 'completed' du client vers 'checked' pour la DB
      const checked = completed !== undefined ? completed : false;
      
      // Generate UUID automatically for ID
      const result = await pool.query(
        'INSERT INTO shopping_items (id, family_id, name, quantity, category, checked, assigned_to, price, notes) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
        [familyId, name, quantity, category, checked, assigned_to, price || 0, notes || '']
      );
      
      // Mapper la réponse de la DB vers le format client
      const responseItem = {
        ...result.rows[0],
        completed: result.rows[0].checked,
        createdAt: result.rows[0].created_at
      };
      delete responseItem.checked;
      delete responseItem.created_at;
      
      notifySync(req, 'shopping-items', 'create', responseItem);
      res.status(201).json(responseItem);
    } catch (error) {
      console.error('Error creating shopping item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/shopping-items/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      
      console.log('🔵 PUT /shopping-items/:id - updating item:', id);
      console.log('🔵 Body received:', JSON.stringify(req.body, null, 2));
      console.log('🔵 Available properties:', Object.keys(req.body));
      
      // First, get the existing item
      const currentItem = await pool.query(
        'SELECT * FROM shopping_items WHERE id = $1 AND family_id = $2',
        [id, familyId]
      );
      
      if (currentItem.rows.length === 0) {
        return res.status(404).json({ error: 'Shopping item not found' });
      }
      
      // Mapper les propriétés du client vers les colonnes de la DB
      const current = currentItem.rows[0];
      const updates = {
        name: req.body.name !== undefined ? req.body.name : current.name,
        quantity: req.body.quantity !== undefined ? req.body.quantity : current.quantity,
        category: req.body.category !== undefined ? req.body.category : current.category,
        checked: req.body.completed !== undefined ? req.body.completed : 
                 req.body.checked !== undefined ? req.body.checked : current.checked,
        assigned_to: req.body.assigned_to !== undefined ? req.body.assigned_to : current.assigned_to,
        price: req.body.price !== undefined ? req.body.price : current.price,
        notes: req.body.notes !== undefined ? req.body.notes : current.notes
      };
      
      console.log('🔵 Merged values:', updates);
      
      const result = await pool.query(
        'UPDATE shopping_items SET name = $1, quantity = $2, category = $3, checked = $4, assigned_to = $5, price = $6, notes = $7 WHERE id = $8 AND family_id = $9 RETURNING *',
        [updates.name, updates.quantity, updates.category, updates.checked, updates.assigned_to, updates.price, updates.notes, id, familyId]
      );
      
      console.log('🟢 Shopping item updated successfully:', result.rows[0]);
      
      // Mapper la réponse de la DB vers le format client
      const responseItem = {
        ...result.rows[0],
        completed: result.rows[0].checked,
        createdAt: result.rows[0].created_at
      };
      delete responseItem.checked;
      delete responseItem.created_at;
      
      notifySync(req, 'shopping-items', 'update', responseItem);
      res.json(responseItem);
    } catch (error) {
      console.error('Error updating shopping item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/shopping-items/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'shopping-items', 'delete', { id });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting shopping item:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Tasks =====
  app.get('/tasks', async (req: Request, res: Response) => {
    console.log('🔵 GET /tasks - Received request');
    try {
      const familyId = (req as any).familyId;
      console.log('🔵 Family ID:', familyId);
      const result = await pool.query(
        'SELECT * FROM tasks WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      console.log('🔵 Found', result.rows.length, 'tasks in database');
      console.log('🔵 Raw rows:', result.rows);
      // Return complete objects from JSONB data field (already parsed by PostgreSQL)
      const tasks = result.rows.map(row => row.data || row);
      console.log('🟢 Returning tasks:', tasks);
      res.json(tasks);
    } catch (error) {
      console.error('🔴 Error fetching tasks:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/tasks', async (req: Request, res: Response) => {
    console.log('🔵 POST /tasks - Received request');
    console.log('🔵 Headers:', req.headers);
    console.log('🔵 Body:', JSON.stringify(req.body, null, 2));
    try {
      const familyId = (req as any).familyId;
      console.log('🔵 Family ID:', familyId);
      const taskData = req.body;
      
      // Generate ID if not provided
      const taskId = taskData.id || randomUUID();
      
      console.log('🔵 Preparing to insert task:', {
        id: taskId,
        familyId,
        title: taskData.title,
        description: taskData.description || null,
        priority: taskData.priority || 'medium',
        status: taskData.completed ? 'done' : 'todo',
        assignedTo: taskData.assignedTo || null,
        dueDate: taskData.dueDate || null,
      });
      
      // Store all task data in JSONB to support all fields
      const result = await pool.query(
        'INSERT INTO tasks (id, family_id, title, description, priority, status, assigned_to, due_date, data) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [
          taskId,
          familyId,
          taskData.title,
          taskData.description || null,
          taskData.priority || 'medium',
          taskData.completed ? 'done' : 'todo',
          taskData.assignedTo || null,
          taskData.dueDate || null,
          JSON.stringify({ ...taskData, id: taskId }) // Stocker tout l'objet avec l'ID en JSONB
        ]
      );
      
      console.log('🟢 Task created successfully:', result.rows[0]);
      // Retourner l'objet complet depuis le champ data (déjà parsé par PostgreSQL)
      const createdTaskData = result.rows[0].data;
      notifySync(req, 'tasks', 'create', createdTaskData);
      res.status(201).json(createdTaskData);
    } catch (error) {
      console.error('🔴 Error creating task:', error);
      console.error('🔴 Error stack:', (error as Error).stack);
      res.status(500).json({ error: 'Internal server error', details: (error as Error).message });
    }
  });

  app.put('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const updates = req.body;
      
      console.log('🔵 PUT /tasks/:id - Received request');
      console.log('🔵 Task ID:', id);
      console.log('🔵 Updates:', updates);
      
      // Get existing task
      const existingTask = await pool.query(
        'SELECT * FROM tasks WHERE id = $1 AND family_id = $2',
        [id, familyId]
      );
      
      if (existingTask.rows.length === 0) {
        return res.status(404).json({ error: 'Task not found' });
      }
      
      // Merge existing data with updates
      const currentData = existingTask.rows[0].data || {};
      const updatedData = { ...currentData, ...updates, id }; // S'assurer que l'id est présent
      
      // Update task
      const result = await pool.query(
        'UPDATE tasks SET title = $1, description = $2, priority = $3, status = $4, assigned_to = $5, due_date = $6, data = $7 WHERE id = $8 AND family_id = $9 RETURNING *',
        [
          updatedData.title || currentData.title,
          updatedData.description || currentData.description || null,
          updatedData.priority || currentData.priority || 'medium',
          updatedData.completed ? 'done' : 'todo',
          updatedData.assignedTo || currentData.assignedTo || null,
          updatedData.dueDate || currentData.dueDate || null,
          updatedData, // Stocker l'objet fusionné en JSONB
          id,
          familyId
        ]
      );
      
      console.log('🟢 Task updated successfully:', result.rows[0].data);
      
      // Retourner l'objet complet depuis le champ data (déjà parsé par PostgreSQL)
      const taskData = result.rows[0].data;
      notifySync(req, 'tasks', 'update', taskData);
      res.json(taskData);
    } catch (error) {
      console.error('🔴 Error updating task:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/tasks/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'tasks', 'delete', { id });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting task:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Appointments =====
  app.get('/appointments', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        `SELECT 
          id, family_id, title, 
          TO_CHAR(date, 'YYYY-MM-DD') as date,
          time, location, description, type, reminder, duration, recurring, members, created_at
        FROM appointments 
        WHERE family_id = $1 
        ORDER BY date DESC`,
        [familyId]
      );
      
      // Format data for client
      const formattedAppointments = result.rows.map(row => ({
        ...row,
        createdAt: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
        members: Array.isArray(row.members) ? row.members : []
      }));
      
      console.log('🔵 GET /appointments - returning:', formattedAppointments);
      res.json(formattedAppointments);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/appointments', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { title, date, time, location, description, type = 'other', reminder = 'none', duration = 60 } = req.body;
      
      // Generate unique ID for appointment
      const id = randomUUID();
      const members = req.body.members || [];
      const recurring = req.body.recurring || null;
      
      console.log('🔵 Creating appointment with ID:', id);
      console.log('🔵 Body received:', req.body);
      
      // Essayer d'abord d'insérer avec toutes les colonnes
      try {
        const result = await pool.query(
          'INSERT INTO appointments (id, family_id, title, date, time, location, description, type, reminder, duration, recurring, members) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, family_id, title, TO_CHAR(date, \'YYYY-MM-DD\') as date, time, location, description, type, reminder, duration, recurring, members, created_at',
          [id, familyId, title, date, time, location, description, type, reminder, duration, JSON.stringify(recurring), JSON.stringify(members)]
        );
        
        // Formater la réponse pour le client
        const formattedAppointment = {
          ...result.rows[0],
          createdAt: result.rows[0].created_at ? result.rows[0].created_at.toISOString() : new Date().toISOString(),
          members: Array.isArray(result.rows[0].members) ? result.rows[0].members : []
        };
        
        console.log('🟢 Appointment created successfully (with all columns):', formattedAppointment);
        notifySync(req, 'appointments', 'create', formattedAppointment);
        res.status(201).json(formattedAppointment);
      } catch (columnError) {
        console.log('⚠️ Trying with basic columns only...');
        // Si ça échoue, essayer avec les colonnes de base uniquement
        const basicResult = await pool.query(
          'INSERT INTO appointments (id, family_id, title, date, time, location, description, members) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, family_id, title, TO_CHAR(date, \'YYYY-MM-DD\') as date, time, location, description, members, created_at',
          [id, familyId, title, date, time, location, description, JSON.stringify(members)]
        );
        
        // Formater la réponse pour le client
        const formattedAppointment = {
          ...basicResult.rows[0],
          createdAt: basicResult.rows[0].created_at ? basicResult.rows[0].created_at.toISOString() : new Date().toISOString(),
          members: Array.isArray(basicResult.rows[0].members) ? basicResult.rows[0].members : []
        };
        
        console.log('🟢 Appointment created successfully (basic columns):', formattedAppointment);
        notifySync(req, 'appointments', 'create', formattedAppointment);
        res.status(201).json(formattedAppointment);
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/appointments/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { title, date, time, location, description, members } = req.body;
      
      console.log('🔵 PUT /appointments/:id - updating appointment:', id);
      console.log('🔵 Body received:', req.body);
      
      const result = await pool.query(
        'UPDATE appointments SET title = $1, date = $2, time = $3, location = $4, description = $5, members = $6 WHERE id = $7 AND family_id = $8 RETURNING id, family_id, title, TO_CHAR(date, \'YYYY-MM-DD\') as date, time, location, description, type, reminder, duration, recurring, members, created_at',
        [title, date, time, location, description, JSON.stringify(members), id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      
      // Formater la réponse comme pour les autres routes
      const formattedAppointment = {
        ...result.rows[0],
        createdAt: result.rows[0].created_at ? result.rows[0].created_at.toISOString() : new Date().toISOString(),
        members: Array.isArray(result.rows[0].members) ? result.rows[0].members : []
      };
      
      console.log('🟢 Appointment updated successfully:', formattedAppointment);
      notifySync(req, 'appointments', 'update', formattedAppointment);
      res.json(formattedAppointment);
    } catch (error) {
      console.error('Error updating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/appointments/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'appointments', 'delete', { id });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Family Members =====
  app.get('/members', async (req: Request, res: Response) => {
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

  app.post('/members', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, name, color, health_info } = req.body;
      const memberId = id || randomUUID();
      
      const result = await pool.query(
        'INSERT INTO family_members (id, family_id, name, color, health_info) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [memberId, familyId, name, color, JSON.stringify(health_info ?? {})]
      );
      
      notifySync(req, 'members', 'create', result.rows[0]);
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/members/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'members', 'update', result.rows[0]);
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/members/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'members', 'delete', { id });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting member:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Recipes =====
  app.get('/recipes', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM recipes WHERE family_id = $1 ORDER BY created_at DESC',
        [familyId]
      );
      res.json(result.rows.map(mapRecipeToClient));
    } catch (error) {
      console.error('Error fetching recipes:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/recipes', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      // Client sends: title, description, category, ingredients, instructions, prepTime, cookTime, servings, image
      const { id, title, description, category, ingredients, instructions, prepTime, cookTime, servings, image } = req.body;

      const recipeId = id || randomUUID();
      
      // Convert instructions string to array if needed
      const instructionsArray = Array.isArray(instructions) 
        ? instructions 
        : (instructions ? instructions.split('\n').filter((s: string) => s.trim()) : []);
      
      const result = await pool.query(
        'INSERT INTO recipes (id, family_id, name, description, category, prep_time, cook_time, servings, ingredients, instructions, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
        [
          recipeId,
          familyId,
          title || 'Sans titre',
          description ?? null,
          category || 'other',
          prepTime ?? null,
          cookTime ?? null,
          servings ?? 1,
          JSON.stringify(ingredients ?? []),
          JSON.stringify(instructionsArray),
          image ?? null,
        ]
      );
      
      const mapped = mapRecipeToClient(result.rows[0]);
      notifySync(req, 'recipes', 'create', mapped);
      res.status(201).json(mapped);
    } catch (error) {
      console.error('Error creating recipe:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/recipes/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { title, description, category, prepTime, cookTime, servings, ingredients, instructions, image } = req.body;
      
      // Convert instructions string to array if needed
      const instructionsArray = Array.isArray(instructions) 
        ? instructions 
        : (instructions ? instructions.split('\n').filter((s: string) => s.trim()) : []);
      
      const result = await pool.query(
        'UPDATE recipes SET name = $1, description = $2, category = $3, prep_time = $4, cook_time = $5, servings = $6, ingredients = $7, instructions = $8, image_url = $9 WHERE id = $10 AND family_id = $11 RETURNING *',
        [title, description, category, prepTime, cookTime, servings, JSON.stringify(ingredients), JSON.stringify(instructionsArray), image, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Recipe not found' });
      }
      
      const mapped = mapRecipeToClient(result.rows[0]);
      notifySync(req, 'recipes', 'update', mapped);
      res.json(mapped);
    } catch (error) {
      console.error('Error updating recipe:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/recipes/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'recipes', 'delete', { id });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting recipe:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Meals =====
  app.get('/meals', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM meals WHERE family_id = $1 ORDER BY date DESC',
        [familyId]
      );
      res.json(result.rows.map(mapMealToClient));
    } catch (error) {
      console.error('Error fetching meals:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/meals', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      // Client sends: date, mealType, recipeId, title, notes
      const { id, date, mealType, recipeId, title, notes } = req.body;

      const mealId = id || randomUUID();
      
      const result = await pool.query(
        'INSERT INTO meals (id, family_id, date, type, recipe_id, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [mealId, familyId, date, mealType || 'lunch', recipeId ?? null, title || notes || '']
      );
      
      const mapped = mapMealToClient(result.rows[0]);
      notifySync(req, 'meals', 'create', mapped);
      res.status(201).json(mapped);
    } catch (error) {
      console.error('Error creating meal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/meals/:id', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id } = req.params;
      const { date, mealType, recipeId, title, notes } = req.body;
      
      const result = await pool.query(
        'UPDATE meals SET date = $1, type = $2, recipe_id = $3, notes = $4 WHERE id = $5 AND family_id = $6 RETURNING *',
        [date, mealType, recipeId, title || notes, id, familyId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Meal not found' });
      }
      
      const mapped = mapMealToClient(result.rows[0]);
      notifySync(req, 'meals', 'update', mapped);
      res.json(mapped);
    } catch (error) {
      console.error('Error updating meal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/meals/:id', async (req: Request, res: Response) => {
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
      
      notifySync(req, 'meals', 'delete', { id });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting meal:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Budgets =====
  app.get('/budgets', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      
      // Get all budgets by category
      const budgetResults = await pool.query(
        'SELECT * FROM budgets WHERE family_id = $1 ORDER BY month DESC, category',
        [familyId]
      );
      
      // Get all expenses
      const expenseResults = await pool.query(
        'SELECT * FROM budget_expenses WHERE family_id = $1 ORDER BY date DESC',
        [familyId]
      );
      
      // Grouper par mois
      const budgetsByMonth: {[key: string]: any} = {};
      
      budgetResults.rows.forEach(budget => {
        if (!budgetsByMonth[budget.month]) {
          budgetsByMonth[budget.month] = {
            id: budget.month, // Utiliser le mois comme ID
            month: budget.month,
            categories: {},
            expenses: []
          };
        }
        budgetsByMonth[budget.month].categories[budget.category] = budget.amount;
      });
      
      // Add expenses
      expenseResults.rows.forEach(expense => {
        const month = expense.date.slice(0, 7); // Extraire YYYY-MM
        if (budgetsByMonth[month]) {
          budgetsByMonth[month].expenses.push(expense);
        }
      });
      
      const budgets = Object.values(budgetsByMonth);
      res.json(budgets);
    } catch (error) {
      console.error('Error fetching budgets:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/budgets', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { month, categories } = req.body;
      
      console.log('Creating budget:', { month, categories });
      
      // Remove old categories for this month (if they exist)
      await pool.query(
        'DELETE FROM budgets WHERE family_id = $1 AND month = $2',
        [familyId, month]
      );
      
      // Insérer les nouvelles catégories
      const insertPromises = Object.entries(categories).map(([category, amount]) => {
        return pool.query(
          'INSERT INTO budgets (id, family_id, category, amount, spent, month) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)',
          [familyId, category, amount, 0, month]
        );
      });
      
      await Promise.all(insertPromises);
      
      // Return created budget
      const result = {
        id: month,
        month,
        categories,
        expenses: []
      };
      
      notifySync(req, 'budgets', 'create', result);
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating budget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.put('/budgets/:month', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { month } = req.params;
      const { categories, expenses } = req.body;
      
      console.log('Updating budget for month:', month, 'with categories:', categories, 'and expenses:', expenses);
      
      // Supprimer les anciennes catégories pour ce mois
      await pool.query(
        'DELETE FROM budgets WHERE family_id = $1 AND month = $2',
        [familyId, month]
      );
      
      // Insérer les nouvelles catégories
      const insertPromises = Object.entries(categories).map(([category, amount]) => {
        return pool.query(
          'INSERT INTO budgets (id, family_id, category, amount, spent, month) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)',
          [familyId, category, amount, 0, month]
        );
      });
      
      await Promise.all(insertPromises);
      
      // Handle expenses if provided
      if (expenses && Array.isArray(expenses)) {
        // Delete old expenses for this month (date range: [monthStart, nextMonthStart))
        const monthStart = `${month}-01`;
        const nextMonthStartDate = new Date(`${month}-01T00:00:00Z`);
        nextMonthStartDate.setUTCMonth(nextMonthStartDate.getUTCMonth() + 1);
        const nextMonthStart = nextMonthStartDate.toISOString().slice(0, 10);

        await pool.query(
          `DELETE FROM budget_expenses
           WHERE family_id = $1 AND date >= $2::date AND date < $3::date`,
          [familyId, monthStart, nextMonthStart]
        );
        
        // Insert new expenses
        const expenseInserts = expenses.map(exp => {
          const expId = exp.id || randomUUID();
          return pool.query(
            'INSERT INTO budget_expenses (id, family_id, category, amount, description, date) VALUES ($1, $2, $3, $4, $5, $6)',
            [expId, familyId, exp.category, exp.amount, exp.description || '', exp.date]
          );
        });
        
        await Promise.all(expenseInserts);
      }
      
      // Return updated budget
      const result = {
        id: month,
        month,
        categories,
        expenses: expenses || []
      };
      
      notifySync(req, 'budgets', 'update', result);
      res.json(result);
    } catch (error) {
      console.error('Error updating budget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/budgets/:month', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { month } = req.params;
      
      // Remove all expenses for this month
      await pool.query(
        'DELETE FROM budget_expenses WHERE family_id = $1 AND date LIKE $2',
        [familyId, `${month}%`]
      );
      
      // Remove all budgets for this month
      const result = await pool.query(
        'DELETE FROM budgets WHERE family_id = $1 AND month = $2 RETURNING month',
        [familyId, month]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Budget not found' });
      }
      
      notifySync(req, 'budgets', 'delete', { month });
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting budget:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ===== Family Configuration =====
  app.get('/family/config', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const result = await pool.query(
        'SELECT * FROM family_configuration WHERE family_id = $1',
        [familyId]
      );
      
      if (result.rows.length === 0) {
        // Return default config if it doesn't exist
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

  app.post('/family/config', async (req: Request, res: Response) => {
    try {
      const familyId = (req as any).familyId;
      const { id, onboarding_completed, storage_mode, theme, language } = req.body;

      const configId = id || `config-${familyId}`;
      
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
        [configId, familyId, onboarding_completed, storage_mode, theme, language]
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
