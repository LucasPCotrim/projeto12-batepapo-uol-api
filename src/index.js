//Imports
//---------------------------------
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import joi from 'joi';
import dayjs from 'dayjs';
import { stripHtml } from 'string-strip-html';
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

//---------------------------------
// Auxiliary function
//---------------------------------
function sanitizeData(string) {
  return stripHtml(string).result.trim();
}

//---------------------------------
// POST (/participants)
//---------------------------------
app.post('/participants', async (req, res) => {
  // Obtain participant object
  const participant = req.body;
  const participantName = sanitizeData(participant.name);

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
    const participants = await db.collection('participants').find().toArray();
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
  const messageRaw = req.body;
  const message = {
    to: sanitizeData(messageRaw.to),
    text: sanitizeData(messageRaw.text),
    type: sanitizeData(messageRaw.type),
  };
  const user = sanitizeData(req.headers.user);

  // Validate message
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().valid('message', 'private_message'),
  });
  const { error } = messageSchema.validate(message);
  if (error) return res.sendStatus(422);

  try {
    // Check if sender is in the database
    const participantSender = await db.collection('participants').findOne({ name: user });
    if (!participantSender) return res.sendStatus(422);

    // Insert message in 'messages' collection
    const messageObj = {
      from: user,
      to: message.to,
      text: message.text,
      type: message.type,
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
  // Obtain user from header and optional message limit from query string
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

//---------------------------------
// POST (/status)
//---------------------------------
app.post('/status', async (req, res) => {
  // Obtain user from header
  const { user } = req.headers;
  try {
    // Check if user is in the database
    const participant = await db.collection('participants').findOne({ name: user });
    if (!participant) return res.sendStatus(404);

    // Update user status with current time
    await db
      .collection('participants')
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });

    // Send '200 OK' status code
    res.sendStatus(200);
  } catch (err) {
    // Error: Failed to update status
    console.log({ err });
    res.sendStatus(500).send('Error: Failed to update status');
  }
});

//---------------------------------
// DELETE (/messages/MESSAGE_ID)
//---------------------------------
app.delete('/messages/:messageId', async (req, res) => {
  const messageId = req.params.messageId;
  console.log(messageId);
});

// Remove inactive users every 15s
const INACTIVE_CHECK_FREQ = 15 * 1000;
// Inactivity time threshold is 10s
const INACTIVE_TIMEOUT = 10 * 1000;
setInterval(async () => {
  const timeBreakpoint = Date.now() - INACTIVE_TIMEOUT;
  try {
    const inactiveParticipants = await db
      .collection('participants')
      .find({ lastStatus: { $lte: timeBreakpoint } })
      .toArray();
    if (inactiveParticipants.length > 0) {
      const InactiveUpdateMessages = inactiveParticipants.map((participant) => {
        return {
          from: participant.name,
          to: 'Todos',
          text: 'sai da sala...',
          type: 'status',
          time: dayjs().format('HH:mm:ss'),
        };
      });
      await db.collection('participants').deleteMany({ lastStatus: { $lte: timeBreakpoint } });
      await db.collection('messages').insertMany(InactiveUpdateMessages);
    }
  } catch (err) {
    // Error: Failed to remove inactive users
    console.log({ err });
    res.sendStatus(500).send('Error: Failed to remove inactive users');
  }
}, INACTIVE_CHECK_FREQ);

// Initialize Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});
