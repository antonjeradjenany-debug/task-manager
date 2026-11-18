import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const { Pool } = pkg;

// Setup PostgreSQL pool and Prisma adapter
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });


const app = express();

app.use(express.json());
app.use(cors());
// Valid enums for Task
const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
// ... (rest of your routes like app.post('/api/tasks', ...))

// 1. Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, status, priority, dueDate } = req.body;

    // 1. Title validation
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Validation Error: Title is required and must be a string' });
    }

    // 2. Status validation (if provided)
    const taskStatus = status ? status.toUpperCase() : 'PENDING';
    if (!VALID_STATUSES.includes(taskStatus)) {
      return res.status(400).json({ 
        error: `Validation Error: Invalid status. Allowed values are: ${VALID_STATUSES.join(', ')}` 
      });
    }

    // 3. Priority validation (if provided)
    const taskPriority = priority ? priority.toUpperCase() : 'MEDIUM';
    if (!VALID_PRIORITIES.includes(taskPriority)) {
      return res.status(400).json({ 
        error: `Validation Error: Invalid priority. Allowed values are: ${VALID_PRIORITIES.join(', ')}` 
      });
    }

    // 4. Due Date validation (if provided)
    let parsedDueDate = null;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ error: 'Validation Error: Invalid dueDate format. Use ISO 8601 (e.g., YYYY-MM-DDTHH:mm:ssZ)' });
      }
    }

    const newTask = await prisma.task.create({
      data: {
        title,
        description,
        status: status || 'PENDING',
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
    });

    return res.status(201).json(newTask);
  } catch (error: any) {
    // Terminal-la full error-a print panrom
    console.error('Error creating task:', error);
    
    // Response-la message-a anupprom
    return res.status(500).json({ 
      error: 'Failed to create task', 
      details: error.message || String(error) 
    });
  }
});

// 

// 2. Get all tasks (with optional filtering by status and priority)
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, priority } = req.query;

    const where: any = {};

    if (status) {
      where.status = String(status).toUpperCase();
    }

    if (priority) {
      where.priority = String(priority).toUpperCase();
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(tasks);
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch tasks', 
      details: error.message || String(error) 
    });
  }
});

// 3. Get a single task by ID
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = Number(req.params.id);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return res.status(400).json({ error: 'Task not found' });
    }

    return res.status(200).json(task);
  } catch (error: any) {
    console.error('Error fetching task:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch task', 
      details: error.message || String(error) 
    });
  }
});

// 4. Update task details and status
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = Number(req.params.id);

    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const { title, description, status, priority, dueDate } = req.body;

    // Check if task exists first
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update the task in database
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(status && { status: status.toUpperCase() }),
        ...(priority && { priority: priority.toUpperCase() }),
        ...(dueDate ? { dueDate: new Date(dueDate) } : dueDate === null ? { dueDate: null } : {}),
      },
    });

    return res.status(200).json(updatedTask);
  } catch (error: any) {
    console.error('Error updating task:', error);
    return res.status(500).json({ 
      error: 'Failed to update task', 
      details: error.message || String(error) 
    });
  }
});

// 5. Delete a task by ID
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.task.delete({
      where: { id: Number(id) },
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task', details: error });
  }
});
// Global Error Handling Middleware (Always put this at the bottom before app.listen)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  
  // Handle Prisma specific known errors if needed
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found in the database' });
  }

  return res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message || 'Something went wrong on the server' 
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});