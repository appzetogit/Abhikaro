import http from 'http';

http.get('http://localhost:5001/api/hero-banners/public', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    console.log('Response:');
    try {
      console.log(JSON.stringify(JSON.parse(data), null, 2));
    } catch {
      console.log(data);
    }
  });
}).on('error', (err) => {
  console.error('Error contacting server:', err.message);
});
