import Joi from 'joi';

const voteDataSchema = Joi.object({
  electionId: Joi.string().uuid().required(),
  userId: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).required(),
  vote: Joi.number().integer().min(0).required(),
  candidates: Joi.array().items(Joi.string()).min(2).required(),
  userRole: Joi.string().valid(
    // Current database values (lowercase)
    'voter', 
    'admin', 
    'analyst', 
    'manager', 
    'moderator', 
    'auditor', 
    'editor', 
    'advertiser',
    // Controller expected values (capitalized)
    'Voters',
    'Individual Election Creators',
    'Organization Election Creators',
    'Manager',
    'Admin',
    'Moderator',
    'Auditor',
    'Editor',
    'Advertiser',
    'Analyst'
  ).required()
});

// const tallyDataSchema = Joi.object({
//   electionId: Joi.string().uuid().required(),
//   userRole: Joi.string().valid(
//     'voter', 'admin', 'analyst', 'manager', 'moderator', 'auditor', 'editor', 'advertiser',
//     'Voters', 'Individual Election Creators', 'Organization Election Creators',
//     'Manager', 'Admin', 'Moderator', 'Auditor', 'Editor', 'Advertiser', 'Analyst'
//   ).required(),
//   userId: Joi.string().uuid().optional()
// });
const tallyDataSchema = Joi.object({
  electionId: Joi.string().uuid().required(),
  userRole: Joi.string().valid(
    'voter', 'admin', 'analyst', 'manager', 'moderator', 'auditor', 'editor', 'advertiser',
    'Voters', 'Individual Election Creators', 'Organization Election Creators',
    'Manager', 'Admin', 'Moderator', 'Auditor', 'Editor', 'Advertiser', 'Analyst'
  ).required(),
  userId: Joi.alternatives().try(
    Joi.number().integer().positive(),
    Joi.string().pattern(/^\d+$/)
  ).optional() // Changed this line
});

export const validateVoteData = (req, res, next) => {
  const { error } = voteDataSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid vote data',
      errors: error.details.map(detail => detail.message)
    });
  }
  next();
};

export const validateTallyData = (req, res, next) => {
  const { error } = tallyDataSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid tally data',
      errors: error.details.map(detail => detail.message)
    });
  }
  next();
};
// import Joi from 'joi';


// const voteDataSchema = Joi.object({
//   electionId: Joi.string().uuid().required(),
//   userId: Joi.alternatives().try(
//     Joi.number().integer().positive(),
//     Joi.string().pattern(/^\d+$/)
//   ).required(),
//   vote: Joi.number().integer().min(0).required(),
//   candidates: Joi.array().items(Joi.string()).min(2).required(),
//   userRole: Joi.string().valid('voter', 'admin', 'analyst', 'manager', 'moderator', 'auditor', 'editor', 'advertiser').required()
// });

// const tallyDataSchema = Joi.object({
//   electionId: Joi.string().uuid().required(),
//   userRole: Joi.string().required(),
//   userId: Joi.string().uuid().optional()

  
// });

// export const validateVoteData = (req, res, next) => {
//   const { error } = voteDataSchema.validate(req.body);
//   if (error) {
//     return res.status(400).json({
//       success: false,
//       message: 'Invalid vote data',
//       errors: error.details.map(detail => detail.message)
//     });
//   }
//   next();
// };

// export const validateTallyData = (req, res, next) => {
//   const { error } = tallyDataSchema.validate(req.body);
//   if (error) {
//     return res.status(400).json({
//       success: false,
//       message: 'Invalid tally data',
//       errors: error.details.map(detail => detail.message)
//     });
//   }
//   next();
// };