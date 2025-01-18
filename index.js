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
		origin: ["http://localhost:5173"],
		credentials: true,
	})
);
app.use(express.json());
app.use(cookieParser());

// token verifications

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
const materialCol = database.collection("materials");
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

app.get("/login", async (req, res) => {
	const token = req.cookies.studyzonetoken;
	if (!token) {
		return res.send({ message: "no token" });
	}
	jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
		if (err) {
			return res.send({ message: "token fny" });
		}
		console.log(decoded);
	});
	const material = await materialCol.findOne({
		sessId: "678b8920caf8fbd4b6e5b9c3",
	});
	res.send({ message: "moja", material });
});

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

// role verification

app.get("/rolecheck", verifyToken, async (req, res) => {
	console.log(`role check requested`);
	const query = { uid: req.user.uid };
	const options = { projection: { _id: 0, role: 1 } };
	const user = await userCol.findOne(query, options);
	console.log(user);
	res.send(user);
});

// user data update

app.put("/updatedata/:id", async (req, res) => {
	const filter = { uid: req.params.id };
	const updatedUser = { $set: req.body };
	const options = { upsert: false };
	const result = await userCol.updateOne(filter, updatedUser, options);
	const user = await userCol.findOne(filter);
	res.send({ result, user });
});

// admin stuff

app.get("/users", verifyToken, async (req, res) => {
	const search = req.query.search;
	if (search === "AllUsers") {
		const cursor = userCol.find();
		const users = await cursor.toArray();
		res.send(users);
	} else {
		const cursor = userCol.find({
			$or: [
				{ email: { $regex: search, $options: "i" } },
				{ name: { $regex: search, $options: "i" } },
			],
		});
		const users = await cursor.toArray();
		res.send(users);
	}
});

app.put("/rolechange", verifyToken, async (req, res) => {
	console.log(req.body);
	const filter = { uid: req.body.uid };
	const updatedUser = { $set: { role: req.body.role } };
	const options = { upsert: false };
	const result = await userCol.updateOne(filter, updatedUser, options);
	res.send({ message: "role successfully changed", result });
});

// session stuff

app.get("/sessions", async (req, res) => {
	const cursor = sessionCol.find();
	const sessions = await cursor.toArray();
	res.send(sessions);
});

app.get("/mysessions/:uid", async (req, res) => {
	console.log(req.params.uid);
	const query = { uid: req.params.uid };
	const cursor = sessionCol.find(query);
	const sessions = await cursor.toArray();
	res.send(sessions);
});

app.get("/myapproved/:uid", async (req, res) => {
	console.log(req.params.uid);
	const query = { uid: req.params.uid, status: "approved" };
	const cursor = sessionCol.find(query);
	const sessions = await cursor.toArray();
	res.send(sessions);
});

app.post("/newsession", verifyToken, async (req, res) => {
	console.log("new session add requested");
	const result = await sessionCol.insertOne(req.body);
	res.send({
		result,
		message: "Request for new session has been submitted for approval",
	});
});

app.put("/editsession", verifyToken, async (req, res) => {
	console.log(req.body);
	const filter = { _id: ObjectId.createFromHexString(req.body.sessId) };
	const updatedSess = { $set: req.body.data };
	const options = { upsert: false };
	const result = await sessionCol.updateOne(filter, updatedSess, options);
	res.send({ message: "Session was successfully edited", result });
});

app.put("/approved", verifyToken, async (req, res) => {
	console.log("approval call");
	const filter = { _id: ObjectId.createFromHexString(req.body.sessId) };
	const updatedSess = { $set: req.body.data };
	const options = { upsert: false };
	const result = await sessionCol.updateOne(filter, updatedSess, options);
	res.send({ message: "Session was successfully approved", result });
});

app.put("/rejected", verifyToken, async (req, res) => {
	console.log("rejection call");
	const filter = { _id: ObjectId.createFromHexString(req.body.sessId) };
	const updatedSess = { $set: req.body.data };
	const options = { upsert: false };
	const result = await sessionCol.updateOne(filter, updatedSess, options);
	res.send({ message: "Session was successfully rejected", result });
});

app.put("/rerequest", verifyToken, async (req, res) => {
	console.log("rejection call");
	const filter = { _id: ObjectId.createFromHexString(req.body.sessId) };
	const updatedSess = { $set: req.body.data };
	const options = { upsert: false };
	const result = await sessionCol.updateOne(filter, updatedSess, options);
	res.send({ message: "Session was successfully rejected", result });
});

app.delete("/deletesession/:id", verifyToken, async (req, res) => {
	const query = { _id: ObjectId.createFromHexString(req.params.id) };
	const result = await sessionCol.deleteOne(query);
	res.send(result);
});

// material stuff

app.get("/allmaterials", async (req, res) => {
	const cursor = materialCol.find();
	const result = await cursor.toArray();
	res.send(result);
});

app.get("/allmymaterials/:email", async (req, res) => {
	const cursor = materialCol.find({ email: req.params.email });
	const result = await cursor.toArray();
	res.send(result);
});

app.get("/material/:sessId", async (req, res) => {
	const query = { sessId: req.params.sessId };
	const material = await materialCol.findOne(query);
	res.send(material);
});

app.put("/material", verifyToken, async (req, res) => {
	const filter = { sessId: req.body.sessId };
	const options = { upsert: true };
	const result = materialCol.updateOne(filter, { $set: req.body }, options);
	res.send({ message: "Materials added successfully", result });
});

app.delete("/material/:id", verifyToken, async (req, res) => {
	console.log("delete request for a material");
	const query = { _id: ObjectId.createFromHexString(req.params.id) };
	const result = await materialCol.deleteOne(query);
	res.send({ message: "material successfully deleted", result });
});
