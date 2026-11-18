import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const { Pool } = pkg;

// Initialize PostgreSQL connection pool and Prisma adapter
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();

// Global Middlewares
app.use(express.json());
app.use(cors());

// Allowed constants for task validation
const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];


// ==========================================
// 1. CREATE A NEW TASK
// ==========================================
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, status, priority, dueDate } = req.body;

    // Validate required title field
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ 
        error: 'Validation Error: Title is required and must be a string' 
      });
    }

    // Validate task status if provided
    const taskStatus = status ? status.toUpperCase() : 'PENDING';
    if (!VALID_STATUSES.includes(taskStatus)) {
      return res.status(400).json({ 
        error: `Validation Error: Invalid status. Allowed values are: ${VALID_STATUSES.join(', ')}` 
      });
    }

    // Validate task priority if provided
    const taskPriority = priority ? priority.toUpperCase() : 'MEDIUM';
    if (!VALID_PRIORITIES.includes(taskPriority)) {
      return res.status(400).json({ 
        error: `Validation Error: Invalid priority. Allowed values are: ${VALID_PRIORITIES.join(', ')}` 
      });
    }

    // Validate due date format if provided
    let parsedDueDate = null;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return res.status(400).json({ 
          error: 'Validation Error: Invalid dueDate format. Use ISO 8601 (e.g., YYYY-MM-DDTHH:mm:ssZ)' 
        });
      }
    }

    // Save the new task to the PostgreSQL database
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
    console.error('Error creating task:', error);
    return res.status(500).json({ 
      error: 'Failed to create task', 
      details: error.message || String(error) 
    });
  }
});


// ==========================================
// 2. GET ALL TASKS (WITH OPTIONAL FILTERING)
// ==========================================
app.get('/api/tasks', async (req, res) => {
  try {
    const { status, priority } = req.query;
    const where: any = {};

    // Filter by status if query parameter is present
    if (status) {
      where.status = String(status).toUpperCase();
    }

    // Filter by priority if query parameter is present
    if (priority) {
      where.priority = String(priority).toUpperCase();
    }

    // Fetch filtered tasks ordered by newest first
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


// ==========================================
// 3. GET A SINGLE TASK BY ID
// ==========================================
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = Number(req.params.id);

    // Check if ID is a valid number
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    // Find the task in the database
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


// ==========================================
// 4. UPDATE TASK DETAILS AND STATUS
// ==========================================
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = Number(req.params.id);

    // Check if ID is a valid number
    if (isNaN(taskId)) {
      return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const { title, description, status, priority, dueDate } = req.body;

    // Verify the task exists before updating
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Update only the provided fields in the database
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


// ==========================================
// 5. DELETE A TASK BY ID
// ==========================================
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Remove the task record from the database
    await prisma.task.delete({
      where: { id: Number(id) },
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete task', details: error });
  }
});


// ==========================================
// GLOBAL ERROR HANDLING MIDDLEWARE
// ==========================================
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled Server Error:', err);
  
  // Handle Prisma record not found error
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found in the database' });
  }

  return res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message || 'Something went wrong on the server' 
  });
});


// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
