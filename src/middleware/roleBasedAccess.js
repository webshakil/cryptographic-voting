//role based access from database
import pool from '../../config/database.js';

export const roleBasedAccess = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      // Get user ID from request (you'll need to add authentication first)
      const userId = req.body.userId || req.headers['x-user-id'];
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User ID required for authorization'
        });
      }

      // Query database to get user's actual roles
      const userQuery = `
        SELECT id, user_type, admin_role, subscription_status
        FROM vottery_user_management 
        WHERE id = $1
      `;
      
      const result = await pool.query(userQuery, [userId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = result.rows[0];
      
      // Determine user's effective roles
      const userRoles = [];
      
      // Add user type if exists
      if (user.user_type) {
        userRoles.push(user.user_type);
      }
      
      // Add admin role if exists
      if (user.admin_role) {
        userRoles.push(user.admin_role);
      }
      
      // Map database values to controller expected values
      const roleMapping = {
        // Database admin_role values to controller expected values
        'manager': 'Manager',
        'admin': 'Admin', 
        'moderator': 'Moderator',
        'auditor': 'Auditor',
        'editor': 'Editor',
        'advertiser': 'Advertiser',
        'analyst': 'Analyst',

        
        
        // Database user_type values to controller expected values
        'voter': 'Voters',
        'individual_creator': 'Individual Election Creators',
        'organization_creator': 'Organization Election Creators'
      };
      // Add this debug logging after the effectiveRoles mapping

      
      // Convert database roles to expected format
      const effectiveRoles = userRoles.map(role => 
        roleMapping[role.toLowerCase()] || role
      );
      
      // Check subscription status for paid features
      if (user.subscription_status !== 'active' && 
          (allowedRoles.includes('Manager') || allowedRoles.includes('Admin'))) {
        return res.status(402).json({
          success: false,
          message: 'Active subscription required for this operation'
        });
      }
      console.log('Debug - Role Analysis:', {
  userId: user.id,
  dbUserType: user.user_type,
  dbAdminRole: user.admin_role,
  userRoles: userRoles,
  effectiveRoles: effectiveRoles,
  allowedRoles: allowedRoles,
  hasPermission: allowedRoles.some(allowedRole => effectiveRoles.includes(allowedRole))
});
      // Check if user has any of the allowed roles
      const hasPermission = allowedRoles.some(allowedRole => 
        effectiveRoles.includes(allowedRole)
      );
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          required: allowedRoles,
          userRoles: effectiveRoles
        });
      }

      console.log('Subscription check:', {
  subscriptionStatus: user.subscription_status,
  allowedRoles: allowedRoles,
  needsManagerOrAdmin: (allowedRoles.includes('Manager') || allowedRoles.includes('Admin')),
  willBlock: user.subscription_status !== 'active' && (allowedRoles.includes('Manager') || allowedRoles.includes('Admin'))
});
      
      // Attach user info to request for use in controllers
      req.user = {
        id: user.id,
        userType: user.user_type,
        adminRole: user.admin_role,
        subscriptionStatus: user.subscription_status,
        effectiveRoles: effectiveRoles
      };
      console.log('Role middleware PASSED - calling next()');
      next();
      
    } catch (error) {
      console.error('Role-based access error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization check failed',
        error: error.message
      });
    }
  };
};


// Alternative: Simple authentication middleware to add before role checks
export const requireAuth = async (req, res, next) => {
  try {
    // This is where you'd verify JWT tokens, sessions, etc.
    // For now, we'll just check if userId is provided
    const userId = req.body.userId || req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Verify user exists
    const userQuery = 'SELECT id FROM vottery_user_management WHERE id = $1';
    const result = await pool.query(userQuery, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid user credentials'
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};
// //role based access from database
// import pool from '../../config/database.js';

// export const roleBasedAccess = (allowedRoles) => {
//   return async (req, res, next) => {
//     try {
//       // Get user ID from request (you'll need to add authentication first)
//       const userId = req.body.userId || req.headers['x-user-id'];
      
//       if (!userId) {
//         return res.status(401).json({
//           success: false,
//           message: 'User ID required for authorization'
//         });
//       }

//       // Query database to get user's actual roles
//       const userQuery = `
//         SELECT id, user_type, admin_role, subscription_status
//         FROM vottery_user_management 
//         WHERE id = $1
//       `;
      
//       const result = await pool.query(userQuery, [userId]);
      
//       if (result.rows.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: 'User not found'
//         });
//       }

//       const user = result.rows[0];
      
//       // Determine user's effective roles
//       const userRoles = [];
      
//       // Add user type if exists
//       if (user.user_type) {
//         userRoles.push(user.user_type);
//       }
      
//       // Add admin role if exists
//       if (user.admin_role) {
//         userRoles.push(user.admin_role);
//       }
      
//       // Map database values to controller expected values
//       const roleMapping = {
//         // Database admin_role values to controller expected values
//         'manager': 'Manager',
//         'admin': 'Admin', 
//         'moderator': 'Moderator',
//         'auditor': 'Auditor',
//         'editor': 'Editor',
//         'advertiser': 'Advertiser',
//         'analyst': 'Analyst',
        
//         // Database user_type values to controller expected values
//         'voter': 'Voters',
//         'individual_creator': 'Individual Election Creators',
//         'organization_creator': 'Organization Election Creators'
//       };
      
//       // Convert database roles to expected format
//       const effectiveRoles = userRoles.map(role => 
//         roleMapping[role.toLowerCase()] || role
//       );
      
//       // Check subscription status for paid features
//       if (user.subscription_status !== 'active' && 
//           allowedRoles.includes('Manager', 'Admin')) {
//         return res.status(402).json({
//           success: false,
//           message: 'Active subscription required for this operation'
//         });
//       }
      
//       // Check if user has any of the allowed roles
//       const hasPermission = allowedRoles.some(allowedRole => 
//         effectiveRoles.includes(allowedRole)
//       );
    
      
//       if (!hasPermission) {
//         return res.status(403).json({
//           success: false,
//           message: 'Insufficient permissions',
//           required: allowedRoles,
//           userRoles: effectiveRoles
//         });
//       }
      
//       // Attach user info to request for use in controllers
//       req.user = {
//         id: user.id,
//         userType: user.user_type,
//         adminRole: user.admin_role,
//         subscriptionStatus: user.subscription_status,
//         effectiveRoles: effectiveRoles
//       };
      
//       next();
      
//     } catch (error) {
//       console.error('Role-based access error:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Authorization check failed',
//         error: error.message
//       });
//     }
//   };
// };

// // Alternative: Simple authentication middleware to add before role checks
// export const requireAuth = async (req, res, next) => {
//   try {
//     // This is where you'd verify JWT tokens, sessions, etc.
//     // For now, we'll just check if userId is provided
//     const userId = req.body.userId || req.headers['x-user-id'];
    
//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: 'Authentication required'
//       });
//     }
    
//     // Verify user exists
//     const userQuery = 'SELECT id FROM vottery_user_management WHERE id = $1';
//     const result = await pool.query(userQuery, [userId]);
    
//     if (result.rows.length === 0) {
//       return res.status(401).json({
//         success: false,
//         message: 'Invalid user credentials'
//       });
//     }
    
//     next();
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: 'Authentication failed',
//       error: error.message
//     });
//   }
// };
// export const roleBasedAccess = (allowedRoles) => {
//   return (req, res, next) => {
//     const userRole = req.body.userRole || req.headers['x-user-role'];
    
//     if (!userRole) {
//       return res.status(401).json({
//         success: false,
//         message: 'User role required'
//       });
//     }

//     if (!allowedRoles.includes(userRole)) {
//       return res.status(403).json({
//         success: false,
//         message: 'Insufficient permissions',
//         required: allowedRoles,
//         provided: userRole
//       });
//     }

//     next();
//   };
// };