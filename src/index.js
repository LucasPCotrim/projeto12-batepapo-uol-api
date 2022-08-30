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
  if (validError) return res.sendStatus(422);

  try {
    // Check if participant is already registered
    const participantAlreadyRegistered = await db
      .collection('participants')
      .findOne({ name: participantName });

    // Participant is already registered
    if (participantAlreadyRegistered) return res.sendStatus(409);

    // Participant is new
    // Insert participant in 'participants' collection
    const participantObj = { name: participantName, lastStatus: Date.now() };
    await db.collection('participants').insertOne(participantObj);
    // Insert log-in message in 'messages' collection
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
    // Error when trying to register participant
    console.error({ err });
    res.status(500).send('Error when trying to register participant');
  }
});

//---------------------------------
// GET (/participants)
//---------------------------------
app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find();
    res.send(participants);
  } catch (err) {
    // Error: Failed to retrieve participants from Database
    console.error({ err });
    res.status(500).send('Error: Failed to retrieve participants from Database');
  }
});

//---------------------------------
// POST (/messages)
//---------------------------------
app.post('/messages', async (req, res) => {
  // Obtain message object from body and user from header
  const message = req.body;
  const { to, text, type } = message;
  const { user } = req.headers;

  // Validate message
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message', 'private_message'),
  });
  const { error } = messageSchema.validate(message);
  if (error) return res.sendStatus(422);

  try {
    // Check if sender is in the participants list
    const participantSender = await db.collection('participants').findOne({ name: user });
    if (!participantSender) return res.sendStatus(422);

    // Insert message in 'messages' collection
    const messageObj = {
      from: user,
      to,
      text,
      type,
      time: dayjs().format('HH:mm:ss'),
    };
    await db.collection('messages').insertOne(messageObj);

    // Send '201 Created' status code
    res.sendStatus(201);
  } catch (err) {
    // Error: Failed to store message in the Database
    console.error({ err });
    return res.status(500).send('Error: Failed to store message in the Database');
  }
});

//---------------------------------
// GET (/messages)
//---------------------------------
app.get('/messages', async (req, res) => {
  const messageLimit = parseInt(req.query.limit);
  const { user } = req.headers;

  try {
    const messages = await db.collection('messages').find().toArray();
    const filteredMessages = messages.filter((message) => {
      const toUser = message.to === 'Todos' || message.to === user || message.from === user;
      const isPublic = message.type === 'message';
      return toUser || isPublic;
    });
    if (messageLimit && messageLimit !== NaN) {
      // Send the last messageLimit messages available to user
      return res.send(filteredMessages.slice(-messageLimit));
    }

    // Send all messages available to user
    res.send(filteredMessages);
  } catch (err) {
    // Error: Failed to retrieve messages from Database
    console.log({ err });
    res.sendStatus(500).send('Error: Failed to retrieve messages from Database');
  }
});

// Initialize Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
