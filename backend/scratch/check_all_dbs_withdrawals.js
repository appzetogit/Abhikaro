import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// We need to define or register schemas dynamically for each connection to avoid Mongoose collision issues
const getWithdrawalRequestModel = (connection) => {
  if (connection.models.WithdrawalRequest) {
    return connection.models.WithdrawalRequest;
  }
  const withdrawalRequestSchema = new mongoose.Schema({
    restaurantId: mongoose.Schema.Types.ObjectId,
    amount: Number,
    status: String,
    restaurantName: String,
    restaurantIdString: String,
    requestedAt: Date
  }, { timestamps: true });
  return connection.model('WithdrawalRequest', withdrawalRequestSchema);
};

const checkAllDatabases = async () => {
  const dbs = ['abhikaro', 'abhikaro_testing', 'abhikaro_testing_abhi'];
  const baseUri = process.env.MONGODB_URI.substring(0, process.env.MONGODB_URI.lastIndexOf('/'));

  for (const dbName of dbs) {
    console.log(`\n======================================================`);
    console.log(`Checking Database: ${dbName}`);
    console.log(`======================================================`);
    
    const dbUri = `${baseUri}/${dbName}?retryWrites=true&w=majority`;
    const conn = await mongoose.createConnection(dbUri).asPromise();
    
    try {
      const WithdrawalRequestModel = getWithdrawalRequestModel(conn);
      const allRequests = await WithdrawalRequestModel.find({}).sort({ createdAt: -1 }).lean();
      
      console.log(`Total Withdrawal Requests: ${allRequests.length}`);

      if (allRequests.length > 0) {
        const statusCounts = {};
        const statusAmounts = {};
        allRequests.forEach(req => {
          const status = req.status || 'Unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
          statusAmounts[status] = (statusAmounts[status] || 0) + (req.amount || 0);
        });

        console.log('--- Summary by Status ---');
        for (const [status, count] of Object.entries(statusCounts)) {
          console.log(`Status: ${status} | Count: ${count} | Total Amount: ₹${statusAmounts[status].toFixed(2)}`);
        }

        console.log('--- Oldest & Newest Request Dates ---');
        const sortedByDate = [...allRequests].sort((a, b) => new Date(a.createdAt || a.requestedAt) - new Date(b.createdAt || b.requestedAt));
        console.log(`Oldest: ${sortedByDate[0].createdAt || sortedByDate[0].requestedAt} | Amount: ₹${sortedByDate[0].amount} | Status: ${sortedByDate[0].status}`);
        console.log(`Newest: ${sortedByDate[sortedByDate.length - 1].createdAt || sortedByDate[sortedByDate.length - 1].requestedAt} | Amount: ₹${sortedByDate[sortedByDate.length - 1].amount} | Status: ${sortedByDate[sortedByDate.length - 1].status}`);
      } else {
        console.log('No withdrawal requests found.');
      }
    } catch (err) {
      console.error(`Error querying database ${dbName}:`, err);
    } finally {
      await conn.close();
    }
  }
  
  process.exit(0);
};

checkAllDatabases();
