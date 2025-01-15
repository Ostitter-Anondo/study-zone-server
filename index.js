const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();

const app = express();

const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies.studyzonetoken;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// mongo setup

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.aye3q.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const database = client.db("studyZone");

const userCol = database.collection("users");
const reviewCol = database.collection("reviews");
const noteCol = database.collection("notes");
const sessionCol = database.collection("sessions");
const pendingCol = database.collection("pendings");
const rejectedCol = database.collection("rejected");
const bookedCol = database.collection("booked");

// general landing

app.get("/", (req, res) => {
  res.send(
    `all your blogses are belong to us. mongodb server is currently functional.`
  );
});

app.listen(port, () => {
  console.log(`we having stuffs happun at ${port}`);
});

// jwt stuff

app.post("/jwt", async (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.TOKEN_SECRET, { expiresIn: "5h" });
  const userData = await userCol.findOne(user);
  const booked = await bookedCol.findOne(user);
  res
    .cookie(`studyzonetoken`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    })
    .send({ userData, booked });
});

app.post("/logout", (req, res) => {
  res
    .clearCookie(`studyzonetoken`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
    })
    .send({ success: true });
});

app.get("/jwtverify", verifyToken, async (req, res) => {
  if (req.user.uid != req.query.uid) {
    return res.status(403).send({ message: "forbidden" });
  }

  res.send("verification success");
});

// mongo stuff //

// auth stuff

app.get("/login", async(req, res) => {
  console.log(req.cookies);
})

app.get("/user/:id", async (req, res) => {
  const query = { uid: req.params.id };
  const user = await userCol.findOne(query);
  const booked = await bookedCol.findOne(query);
  res.send({ user, booked });
});

app.post("/newuser", async (req, res) => {
  const newBookings = { uid: req.body.uid, wishlist: [] };
  const bookedData = await bookedCol.insertOne(newBookings);
  const newUser = {
    uid: req.body.uid,
    email: req.body.email,
    name: req.body.name,
    photo: req.body.photo,
    role: req.body.role,
    bookedId: bookedData.insertedId,
  };
  console.log(`creating new user with data`, newUser);
  const result = await userCol.insertOne(newUser);
  res.send(result);
});