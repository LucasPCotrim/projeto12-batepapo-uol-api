//Imports
//---------------------------------
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import joi from 'joi';
import { MongoClient } from 'mongodb';
import dayjs from 'dayjs';

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

//---------------------------------
// POST (/participants)
//---------------------------------
app.post('/participants', async (req, res) => {
  // Obtain participant object
  const participant = req.body;
  const { name: participantName } = participant;

  // Validate participant
  const participantSchema = joi.object({ name: joi.string().required() });
  const { validError } = participantSchema.validate(participant);
  if (validError) {
    return res.sendStatus(422);
  }

  // Check if participant is already registered
  try {
    const participantAlreadyRegistered = await db
      .collection('participants')
      .findOne({ name: participantName });

    // Participant is already registered
    if (participantAlreadyRegistered) return res.sendStatus(409);

    // Participant is new
    // Insert participant in 'participants' collection
    const participantObj = { name: participantName, lastStatus: Date.now() };
    await db.collection('participants').insertOne(participantObj);
    // Insert log in message in 'messages' collection
    const logInMessageObj = {
      from: participantName,
      to: 'Todos',
      text: 'entra na sala...',
      type: 'status',
      time: dayjs().format('HH:mm:ss'),
    };
    await db.collection('messages').insertOne(logInMessageObj);

    // Send '201 Created' status code
    res.sendStatus(201);
  } catch (err) {
    console.error({ err });
    res.status(500).send('Error: Failed to register participant');
  }
});

//---------------------------------
// GET (/participants)
//---------------------------------
app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find();
    console.log(participants);
    res.send(participants);
  } catch (error) {
    console.error({ error });
    res.status(500).send('Error: Failed to retrieve participants from Database');
  }
});

// Initialize Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
