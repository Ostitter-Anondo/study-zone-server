const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const app = express();

const port = process.env.PORT || 3000;

app.use(
	cors({
		origin: [
			"http://localhost:5173",
			"https://study-zone-ostitteranondo.web.app",
			"https://study-zone-ostitteranondo.firebaseapp.com",
		],
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
const announcementCol = database.collection("announcements");

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

app.get("/login", verifyToken, async (req, res) => {
	const query = { uid: req.user.uid };
	console.log(query);
	const booked = await bookedCol.findOne(query);
	console.log(booked);
	res.send({ message: "moja", booked });
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

app.put("/socialuser", async (req, res) => {
	const findUser = await userCol.findOne({ uid: req.body.uid });
	if (findUser) {
		const findBooked = await bookedCol.findOne({ uid: req.body.uid });
		res.send({ user: findUser, booked: findBooked });
	} else {
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
		const query = { uid: req.body.uid };
		const user = await userCol.findOne(query);
		const booked = await bookedCol.findOne(query);
		res.send({ user, booked, result });
	}
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

app.get("/countapproved", async (req, res) => {
	console.log("getcounted");
	const count = await sessionCol.countDocuments({ status: "approved" });
	console.log(count);
	res.send({ count: count });
});

app.get("/indivsession/:id", verifyToken, async (req, res) => {
	const query = { _id: ObjectId.createFromHexString(req.params.id) };
	const session = await sessionCol.findOne(query);
	res.send({ session });
});

app.get("/allapproved", async (req, res) => {
	const page = Number(req.query.page);
	const size = 6;
	console.log(page);
	const filter = { status: "approved" };
	const cursor = sessionCol
		.find(filter)
		.skip(size * page)
		.limit(size);
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

app.get("/homepagestuff", async (req, res) => {
	const now = new Date().getTime();
	const querySess = { status: "approved", regEnd: { $gt: now } };
	const options = { sort: { regEnd: 1 } };
	const queryInst = { role: "instructor" };
	const cursorA = sessionCol.find(querySess, options).limit(6);
	const cursorB = userCol.find(queryInst);
	const sessions = await cursorA.toArray();
	const instructors = await cursorB.toArray();
	res.send({ sessions, instructors });
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

// book session handle

app.get("/mybooked", verifyToken, async (req, res) => {
	if (req.query.booked.length > 0) {
		const filter = req.query.booked
			.split(",")
			.map((booking) => ObjectId.createFromHexString(booking));
		const cursor = sessionCol.find({ _id: { $in: filter } });
		const result = await cursor.toArray();
		res.send(result);
	} else {
		res.send([]);
	}
});

app.get("/mybookedmaterials", verifyToken, async (req, res) => {
	console.log(req.query);
	const filter = req.query.booked.split(",");
	const cursor = materialCol.find({ sessId: { $in: filter } });
	const result = await cursor.toArray();
	res.send(result);
});

app.put("/booking", verifyToken, async (req, res) => {
	console.log("booked list modification");
	const filter = { uid: req.user.uid };
	const options = { upsert: false };
	const result = await bookedCol.updateOne(filter, { $set: req.body }, options);
	const booked = await bookedCol.findOne(filter);
	res.send({ message: "Materials added successfully", result, booked });
});

// payment

app.post("/create-payment-intent", async (req, res) => {
	if (req.body.price) {
		const { price } = req.body;
		const amount = parseInt(price * 100);
		console.log(amount, "taka paisi");
		const paymentIntent = await stripe.paymentIntents.create({
			amount: amount,
			currency: "usd",
			payment_method_types: ["card"],
		});
		res.send({
			clientSecret: paymentIntent.client_secret,
		});
	} else {
		res.status(400).send("no payment was requested");
	}
});

// student notes

app.get("/notes", verifyToken, async (req, res) => {
	const query = { uid: req.user.uid };
	const cursor = noteCol.find(query);
	const result = await cursor.toArray();
	res.send(result);
});

app.post("/notes", verifyToken, async (req, res) => {
	console.log("new note added");
	const result = await noteCol.insertOne(req.body);
	res.send({ message: "note was added successfully", result });
});

app.put("/notes", verifyToken, async (req, res) => {
	console.log("note edit requested");
	const filter = { _id: ObjectId.createFromHexString(req.query.noteId) };
	const options = { upsert: false };
	const result = await noteCol.updateOne(filter, { $set: req.body }, options);
	res.send({ message: "note successfully edited", result });
});

app.delete("/notes", verifyToken, async (req, res) => {
	console.log("note deletion requested");
	const filter = { _id: ObjectId.createFromHexString(req.query.noteId) };
	const result = await noteCol.deleteOne(filter);
	res.send({ message: "note successfully deleted", result });
});

// reviews

app.get("/review", verifyToken, async (req, res) => {
	const query = { sessId: req.query.sessId };
	const cursor = reviewCol.find(query);
	const result = await cursor.toArray();
	res.send(result);
});

app.put("/review", verifyToken, async (req, res) => {
	console.log("review add/edit request");
	const filter = { uid: req.user.uid };
	const options = { upsert: true };
	const result = await reviewCol.updateOne(filter, { $set: req.body }, options);
	res.send({ message: "review edited!", result });
});

app.post("/review", verifyToken, async (req, res) => {
	console.log("review add/edit request");
	const result = await reviewCol.insertOne(req.body);
	res.send({ message: "review added!", result });
});

app.delete("/review", verifyToken, async (req, res) => {
	const filter = { _id: ObjectId.createFromHexString(req.query.reviewId) };
	const result = await reviewCol.deleteOne(filter);
	res.send({ message: "review successfully deleted", result });
});

// announcement

app.get("/countannouncements", async (req, res) => {
	console.log("getcounted other");
	const count = await announcementCol.countDocuments();
	console.log(count);
	res.send({ count: count });
});

app.get("/announcement", async (req, res) => {
	const page = Number(req.query.page);
	const size = 6;
	console.log(page);
	const cursor = announcementCol
		.find()
		.skip(size * page)
		.limit(size);
	const sessions = await cursor.toArray();
	res.send(sessions);
});

app.post("/makeannouncement", verifyToken, async (req, res) => {
	console.log("announcement was made");
	const result = await announcementCol.insertOne(req.body);
	res.send({ message: "new announcement successfully made", result });
});

app.delete("/announcement", verifyToken, async (req, res) => {
	console.log("deleting an announcement");
	const filter = {
		_id: ObjectId.createFromHexString(req.query.announcementId),
	};
	const result = await announcementCol.deleteOne(filter);
	res.send({ message: "review successfully deleted", result });
});
