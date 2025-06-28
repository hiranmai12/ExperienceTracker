const bcrypt = require('bcryptjs');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Utility: Calculate duration between two dates
const calculateDuration = (startDate, endDate = new Date()) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
  days = Math.max(days, 0);
  const years = Math.floor(days / 365);
  days %= 365;
  const months = Math.floor(days / 30);
  days %= 30;
  return { years, months, days };
};

// Utility: Add two durations
const sumDurations = (d1, d2) => {
  let days = d1.days + d2.days;
  let months = d1.months + d2.months + Math.floor(days / 30);
  days %= 30;
  let years = d1.years + d2.years + Math.floor(months / 12);
  months %= 12;
  return { years, months, days };
};


// Employee Schema
const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  designation: { type: String, required: true },
  educationalQualifications: {
    ug: String,
    pg: String
  },
  department: { type: String, required: true },
  dateOfBirth: { type: Date, required: true },
  dateOfJoining: { type: Date, required: true },
  previousExperience: {
    years: Number,
    months: Number,
    days: Number
  }
});
const Employee = mongoose.model('Employee', employeeSchema, 'List');

// User Schema with role
const userSchema = new mongoose.Schema({
  facultyId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'faculty'], default: 'faculty' }
});
const User = mongoose.model('User', userSchema, 'Users');

// Add calculated fields
const calculateFields = (emp) => {
  const currentExperience = calculateDuration(emp.dateOfJoining);
  const totalExperience = sumDurations(currentExperience, emp.previousExperience);
  const totalAge = calculateDuration(emp.dateOfBirth);
  return { ...emp, currentExperience, totalExperience, totalAge };
};


app.get('/api/employees', async (req, res) => {
  const data = await Employee.find();
  res.json(data.map(e => calculateFields(e.toObject())));
});

app.get('/api/employees/:employeeId', async (req, res) => {
  try {
    const emp = await Employee.findOne({ employeeId: req.params.employeeId });
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    res.json(calculateFields(emp.toObject()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const newEmp = new Employee(req.body);
    const saved = await newEmp.save();
    res.status(201).json(calculateFields(saved.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.put('/api/employees/:employeeId', async (req, res) => {
  try {
    const updated = await Employee.findOneAndUpdate(
      { employeeId: req.params.employeeId },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Employee not found" });
    res.json(calculateFields(updated.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/api/employees/:employeeId', async (req, res) => {
  try {
    const deleted = await Employee.findOneAndDelete({ employeeId: req.params.employeeId });
    if (!deleted) return res.status(404).json({ message: "Employee not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


app.post('/api/register', async (req, res) => {
  try {
    const { facultyId, password } = req.body;

    if (!facultyId || !password) {
      return res.status(400).json({ message: "Faculty ID and password required" });
    }

    if (facultyId.toLowerCase() === 'admin') {
      return res.status(403).json({ message: "Cannot register as admin." });
    }

    const existingUser = await User.findOne({ facultyId });
    if (existingUser) {
      return res.status(409).json({ message: "Faculty ID already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ facultyId, password: hashedPassword, role: 'faculty' });
    await user.save();

    res.status(201).json({ message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Login (admin + faculty)
app.post('/api/login', async (req, res) => {
  try {
    const { facultyId, password } = req.body;

    const user = await User.findOne({ facultyId });
    if (!user) return res.status(401).json({ message: "Invalid faculty ID" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    res.status(200).json({
      message: "Login successful",
      facultyId: user.facultyId,
      role: user.role
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});


const createDefaultAdmin = async () => {
  const existingAdmin = await User.findOne({ facultyId: 'admin' });
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash('admin', 10);
    await new User({
      facultyId: 'admin',
      password: hashedPassword,
      role: 'admin'
    }).save();
    console.log('✅ Default admin created: facultyId = admin, password = admin');
  } else {
    console.log('✅ Default admin already exists.');
  }
};

createDefaultAdmin();

app.listen(5000, () => console.log('🚀 Server is running on port 5000'));
