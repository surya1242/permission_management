const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const bcrypt = require('bcrypt');
const axios = require('axios'); // Import axios for API requests

const app = express();

const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Function to fetch exercise details from API

app.get("/",(req,res)=>{
  res.render("home");
})
app.get("/mlogin",(req,res)=>{
  res.render("madamlogin",{errorMessage:null});
})
// Register endpoint
app.get('/register', (req, res) => {
  res.render('register', { errorMessage: null });
});

app.post('/register', async (req, res) => {
  const { username, email, phoneNumber, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.render('register', { errorMessage: 'Passwords do not match' });
  }

  if (!/^\d{10}$/.test(phoneNumber)) {
    return res.render('register', { errorMessage: 'Phone number must be 10 digits' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.render('register', { errorMessage: 'Invalid email format' });
  }

  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    if (!snapshot.empty) {
      return res.render('register', { errorMessage: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
      
    await db.collection('users').doc(email).set({
      username,
      email,
      phoneNumber,
      password: hashedPassword,
    });


    res.redirect('/login');

  } catch (err) {
    res.status(500).send('Server Error: ' + err.message);
  }
});

// Login endpoint
app.get('/login', (req, res) => {
  res.render('login', { errorMessage: null });
});
var s1="";

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
s1=email;
  try {
    const userDoc = await db.collection('users').doc(email).get();
    if (!userDoc.exists) {
      return res.render('login', { errorMessage: 'Incorrect email or password' });
    }

    const user = userDoc.data();
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      res.redirect('/exerciseResults');
    } else {
      return res.render('login', { errorMessage: 'Incorrect email or password' });
    }
  } catch (err) {
    res.status(500).send('Server Error: ' + err.message);
  }
});
app.post('/login1', async (req, res) => {
  const { email, password } = req.body;
s1=email;
  try {
    const userDoc = await db.collection('madam').doc(email).get();
    console.log(userDoc.exists);
    if (!userDoc.exists) {
      return res.render('login', { errorMessage: 'Incorrect email or password' });
    }
   console.log(userDoc.data());
    const user = userDoc.data();
    const isMatch =password === user.password;

    if (isMatch) {
      res.redirect('/madam');
    } else {
      return res.render('login', { errorMessage: 'Incorrect email or password' });
    }
  } catch (err) {
    res.status(500).send('Server Error: ' + err.message);
  }
});

// Exercise results endpoint

app.get('/exerciseResults', async (req, res) => {
  try {
    const usersRef = db.collection('users'); // Reference to 'users' collection
    const userSnapshot = await usersRef.where('email', '==', s1).get(); 

    let username = '';
    userSnapshot.forEach(doc => {
      const userData = doc.data();
      username = userData.username; // Assuming 'username' field exists in your document
      console.log('Username:', username); // Log the username
    });

    // Fetch the leave request from the store collection using the user's email
    const storeRef = db.collection('store');
    const storeSnapshot = await storeRef.where('email', '==', s1).get();

    let leaveStatus = null; // Initialize leave status

    storeSnapshot.forEach(doc => {
      const storeData = doc.data();
      leaveStatus = storeData.flag; // Get the flag value (null = pending, true = approved, false = rejected)
    });
      console.log(leaveStatus);
    // Render the result based on the leave status
    if (leaveStatus === null) {
      res.render("exerciseResults", { email: username, year: null }); // Pending request
    } else if (leaveStatus === true) {
      res.render('exerciseResults', { email: username, year: true }); // Approved request
    } else {
      res.render('exerciseResults', { email: username, year: false }); // Rejected request
    }

  } catch (error) {
    console.error('Error fetching leave request:', error);
    res.status(500).send('Server Error');
  }
});

app.post("/submit-leave",async(req,res)=>{
  const {name,id,email,section,branch,year,reason}=req.body;
  console.log(name);
  try{
   db.collection('store').add({
       name:name,
       email:email,
       id:id,
       section:section,
       branch:branch,
       year:year,
       reason:reason,
       flag:null
   })
   const docRef = db.collection('store').doc(id); // Assuming 'store' is your collection
   const doc = await docRef.get();
   const data = doc.data();
   const flagValue = data; 
   console.log(flagValue);
    res.render("exerciseResults",{year:null,email:s1})
  }
  catch (error){
    console.log("error"+error);
  }
})
// app.get('/exercises', async (req, res) => {
//   const muscle = req.query.muscle;

//   try {
//     const details = await fetchExerciseDetails(muscle);
//     res.render('exerciseResults', { muscle, details });
//   } catch (error) {
//     res.status(500).send('Server Error: ' + error.message);
//   }
// });
// Fetch pending leave requests and display them in the madam view
app.get("/madam", async (req, res) => {
  try {
    const leaveRequests = [];
    const snapshot = await db.collection('store').where('flag', '==', null).get(); // Fetch requests with flag as null
    snapshot.forEach(doc => {
      leaveRequests.push({ ...doc.data(), docId: doc.id }); // Include docId for updating the document
    });

    res.render("madam", { leaveRequests }); // Pass leaveRequests to the madam view
  } catch (error) {
    console.error("Error fetching leave requests:", error);
    res.status(500).send("Error fetching leave requests.");
  }
});

// Handle leave approval or rejection
app.post("/madam", async (req, res) => {
  const { docId, value } = req.body; // Get document ID and decision (agree or reject)

  try {
    const flagValue = value === "agree" ? true : false; // Set flag to true if agreed, false if rejected
    await db.collection('store').doc(docId).update({
      flag: flagValue
    });

    res.redirect("/madam"); // Redirect back to madam page to see updated leave requests
  } catch (error) {
    console.error("Error updating leave request:", error);
    res.status(500).send("Error updating leave request.");
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
