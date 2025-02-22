const adminAuth = (req, res, next) => {
    // Check if user is authenticated as admin
    if (req.session.isAdmin && req.session.adminId) {
        return next();
    }
    
    // Clear any partial authentication state
    delete req.session.tempAdmin;
    delete req.session.setupTOTP;
    
    // Store the intended URL
    req.session.returnTo = req.originalUrl;
    res.redirect('/admin/login');
};

module.exports = adminAuth; 