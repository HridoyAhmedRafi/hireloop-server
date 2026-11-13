import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

const app = express()
const PORT = process.env.PORT || 5000

//middleware
app.use(express.json())
app.use(cors())


const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}
const mongoClient = await connectToMongoDB()
const db = mongoClient.db("hireloop-db")
const users = db.collection("user")
const jobs = db.collection('jobs')
const applications = db.collection("applications")
const payments = db.collection("payments")

app.get('/', (req, res) => {
    res.send({ Msg: "API is working" })
})

// users apis
app.get("/users", async (req, res) => {
    const cursor = users.find({});
    const result = await cursor.toArray()
    res.send(result)
})

app.get('/users/:id/premium', async (req, res) => {
    const id = req.params.id
    const query = { _id: new ObjectId(id) }
    const result = await users.findOne(query, { projection: { premium: 1 } })
    res.send(result)
})

// job related api
// create
app.post('/add-job', async (req, res) => {
    const job = {
        ...req.body,
        status: "Active",
        applicants: 0,
        postedAt: new Date().toISOString().slice(0, 10),
    }
    const result = await jobs.insertOne(job)
    res.send(result)
})
// get
app.get('/jobs', async (req, res) => {
    const query = {}
    if (req.query.jobType) {
        query.jobType = {
            $regex: `^${req.query.jobType}$`,
            $options: "i"
        };
    }
    if (req.query.remote) {
        query.remote = req.query.remote === "true";
    }
    if (req.query.category) {
        query.category = req.query.category
    }

    if (req.query.search) {
        query.$or = [
            { title: { $regex: req.query.search, $options: "i" } },
            { company: { $regex: req.query.search, $options: "i" } },
            { requirements: { $regex: req.query.search, $options: "i" } }
        ];
    }
    const cursor = jobs.find(query)
    const result = await cursor.toArray()
    res.send(result)
})
//get sginel job
app.get('/jobs/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) }
    const result = await jobs.findOne(query)
    res.send(result)
})
//update
app.patch('/jobs/:id', async (req, res) => {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) }
    const updatedJob = req.body
    const updatedDoc = {
        $set: updatedJob
    }
    const result = await jobs.updateOne(filter, updatedDoc)
    res.send(result)
})

// delete
app.delete('/jobs/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) }
    const result = await jobs.deleteOne(query)
    res.send(result)
})

// applications
// post
app.post('/applications', async (req, res) => {
    const application = {
        ...req.body,
        status: "Applied",
        postedAt: new Date().toISOString().slice(0, 10),
    }
    const result = await applications.insertOne(application)
    res.send(result)
})
// get
app.get('/applications', async (req, res) => {
    const query = {}
    if (req.query.applicantId) {
        query.userId = req.query.applicantId;
    }
    const cursor = applications.find(query)
    const result = await cursor.toArray()
    res.send(result)
})
//
app.get('/applications/count', async (req, res) => {
    const query = {}
    if (req.query.applicantId) {
        query.userId = req.query.applicantId;
    }
    const result = await applications.countDocuments(query)
    res.send({ count: result })
})

// payments apis
app.post('/payments/checkout-varify', async (req, res) => {
    const { sessionId } = req.body
    if (!sessionId) {
        return res.send({ success: false, message: "Session ID required" })
    }
    const { status,
        customer_email,
        metadata,
        payment_intent,
        payment_status, } = await stripe.checkout.sessions.retrieve(sessionId)

    if (status === "complete" && payment_status === "paid") {
        const sessionQuery = { sessionId }
        const existingPayment = await payments.findOne(sessionQuery)
        if (existingPayment) {
            return res.send({ success: false, message: 'Payment already varified' })
        }

        const payment = {
            sessionId,
            status,
            customer_email,
            userId: metadata.userId,
            paymentDate: new Date(),
            payment_intent,
            payment_status
        }
        const result = await payments.insertOne(payment)

        const query = { _id: new ObjectId(metadata.userId) }
        const updatedDoc = {
            $set: {
                premium: true
            }
        }
        const updatedResult = await users.updateOne(query, updatedDoc)
        res.send({ success: true, result, updatedResult })
        return
    }
    res.send({ success: false, message: 'Payment varificaton failed' })

    // is used new session
    // check is the session id for currently logged in user
    // insert sessionId into payments collection
    // update user information as premium user 
})

app.listen(PORT, () => {
    console.log(`Server is running on PORT${PORT}`);
})