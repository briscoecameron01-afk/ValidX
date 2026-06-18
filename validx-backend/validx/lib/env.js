const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env'), override: false });

