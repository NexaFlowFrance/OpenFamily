import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import shoppingRoutes from './routes/shopping';
import tasksRoutes from './routes/tasks';
import appointmentsRoutes from './routes/appointments';
import recipesRoutes from './routes/recipes';
import mealPlansRoutes from './routes/mealPlans';
import budgetRoutes from './routes/budget';
import familyRoutes from './routes/family';
import dashboardRoutes from './routes/dashboard';
import planningRoutes from './routes/planning';
import dataTransferRoutes from './routes/dataTransfer';
import { loadEnv } from './config/loadEnv';

loadEnv();

const app = express();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/shopping', shoppingRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/meal-plans', mealPlansRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/data', dataTransferRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ success: false, error: 'Route not found' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
