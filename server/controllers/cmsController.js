const CMSContent = require('../models/CMSContent');

class CMSController {
  
  // Create CMS content
  async createContent(req, res) {
    try {
      const { type, title, content, image, isActive, order, metadata, startDate, endDate } = req.body;

      const cmsContent = new CMSContent({
        type,
        title,
        content,
        image,
        isActive: isActive !== undefined ? isActive : true,
        order: order || 0,
        metadata: metadata || {},
        startDate: startDate || null,
        endDate: endDate || null,
        createdBy: req.user.id
      });

      await cmsContent.save();

      res.status(201).json({
        success: true,
        message: 'CMS content created successfully',
        data: cmsContent
      });
    } catch (error) {
      console.error('Create CMS content error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while creating CMS content'
      });
    }
  }

  // Get CMS content by type
  async getContentByType(req, res) {
    try {
      const { type } = req.params;
      const { activeOnly = 'true' } = req.query;

      const query = { type };
      
      if (activeOnly === 'true') {
        query.isActive = true;
        // Filter by date range if applicable
        query.$or = [
          { startDate: null, endDate: null },
          { startDate: { $lte: new Date() }, endDate: { $gte: new Date() } },
          { startDate: { $lte: new Date() }, endDate: null },
          { startDate: null, endDate: { $gte: new Date() } }
        ];
      }

      const content = await CMSContent.find(query)
        .populate('createdBy', 'fullName email')
        .sort({ order: 1, createdAt: -1 })
        .exec();

      res.status(200).json({
        success: true,
        data: content
      });
    } catch (error) {
      console.error('Get CMS content error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching CMS content'
      });
    }
  }

  // Update CMS content
  async updateContent(req, res) {
    try {
      const { contentId } = req.params;
      const updates = req.body;

      const content = await CMSContent.findByIdAndUpdate(
        contentId,
        {
          ...updates,
          updatedBy: req.user.id
        },
        { new: true, runValidators: true }
      ).populate('createdBy', 'fullName email');

      if (!content) {
        return res.status(404).json({
          success: false,
          message: 'CMS content not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'CMS content updated successfully',
        data: content
      });
    } catch (error) {
      console.error('Update CMS content error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while updating CMS content'
      });
    }
  }

  // Delete CMS content
  async deleteContent(req, res) {
    try {
      const { contentId } = req.params;

      const content = await CMSContent.findByIdAndDelete(contentId);

      if (!content) {
        return res.status(404).json({
          success: false,
          message: 'CMS content not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'CMS content deleted successfully'
      });
    } catch (error) {
      console.error('Delete CMS content error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while deleting CMS content'
      });
    }
  }

  // Get all CMS content for admin
  async getAllContent(req, res) {
    try {
      const { page = 1, limit = 20, type, isActive } = req.query;

      const query = {};
      if (type) query.type = type;
      if (isActive !== undefined) query.isActive = isActive === 'true';

      const content = await CMSContent.find(query)
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ type: 1, order: 1, createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .exec();

      const total = await CMSContent.countDocuments(query);

      res.status(200).json({
        success: true,
        data: {
          content,
          totalPages: Math.ceil(total / limit),
          currentPage: parseInt(page),
          total
        }
      });
    } catch (error) {
      console.error('Get all CMS content error:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching CMS content'
      });
    }
  }
}

module.exports = new CMSController();