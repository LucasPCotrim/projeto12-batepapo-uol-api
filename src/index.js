import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

// Configure Dotenv
dotenv.config();

// Create server
const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
let db = null;
const mongoClient = new MongoClient(process.env.MONGO_DATABASE_URI);
const promise = mongoClient.connect().then(() => {
  db = mongoClient.db(process.env.MONGO_DATABASE_NAME);
});
promise.catch((err) => {
  console.log('Error when trying to connect to the database:', err);
});

// POST (/participants)
app.post('/participants', (req, res) => {
  const { name } = req.body;
  console.log(name);
});

// Initialize Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
