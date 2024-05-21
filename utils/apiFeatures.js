class APIFeatures {
  constructor(query, queryString) {
    this.query = query; // Mongoose query object - i.e. the result of <model>.find()
    this.queryString = queryString; // query string, i.e. req.query (http request)
  }

  // methods
  filter() {
    const queryObj = { ...this.queryString }; // create a new object populated with destructured req.query
    const excludedFields = ['page', 'sort', 'limit', 'fields'];
    excludedFields.forEach((el) => delete queryObj[el]);

    // 1B) Advanced filtering - e.g. url.../api/v1/tours?duration[gte]=5
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
    this.query = this.query.find(JSON.parse(queryStr));

    return this; // enables us to chain additional methods
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' '); // replace commas with space
      this.query = this.query.sort(sortBy);
    } else {
      // default sorting
      this.query = this.query.sort('-createdAt');
    }

    return this; // enables us to chain other API methods
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    } else {
      // default selection
      this.query = this.query.select('-__v'); // all fields EXCEPT the __v field
    }

    return this; // enables us to chain other API methods
  }

  paginate() {
    const page = this.queryString.page * 1 || 1; // * 1 converts supplied page to number, default is 1
    const limit = this.queryString.limit * 1 || 100; // default is 100
    const skip = (page - 1) * limit;
    this.query = this.query.skip(skip).limit(limit);

    return this; // enables us to chain other API methods
  }
}

module.exports = APIFeatures;
