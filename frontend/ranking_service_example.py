# Python Backend Service for Candidate Ranking
# 
# Save this as: python-backend/ranking_service.py
# 
# Requirements: pip install flask flask-cors numpy scikit-learn
# Run: python ranking_service.py
# 
# This service provides an API endpoint for candidate ranking
# using your custom Python-based ML model

from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from typing import List, Dict, Any
import logging

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================
# Your ML Model (Replace with your actual model)
# ============================================

class CandidateRankingModel:
    """
    Your custom ranking model
    Replace the implementation with your actual ML model
    """
    
    def __init__(self):
        # Load your model here
        # Example: self.model = joblib.load('model.pkl')
        pass
    
    def calculate_score(self, candidate: Dict[str, Any], job_requirements: Dict[str, Any]) -> Dict[str, float]:
        """
        Calculate ranking scores for a candidate
        
        Args:
            candidate: {name, email, phone, experience, skills, resumeText}
            job_requirements: {requiredSkills, minExperience, jobDescription}
        
        Returns:
            {aiScore: 0-100, resumeMatch: 0-100, skillsMatch: 0-100, experienceMatch: 0-100}
        """
        
        # Extract data
        skills = candidate.get('skills', [])
        experience = self._parse_experience(candidate.get('experience', '0'))
        required_skills = job_requirements.get('requiredSkills', [])
        min_experience = job_requirements.get('minExperience', 0)
        
        # Calculate individual scores
        skills_match = self._calculate_skills_match(skills, required_skills)
        experience_match = self._calculate_experience_match(experience, min_experience)
        resume_match = self._calculate_resume_match(
            candidate.get('resumeText', ''),
            job_requirements.get('jobDescription', '')
        )
        
        # Weighted average
        ai_score = round(
            skills_match * 0.4 +
            experience_match * 0.35 +
            resume_match * 0.25
        )
        
        return {
            'aiScore': min(100, max(0, ai_score)),
            'resumeMatch': resume_match,
            'skillsMatch': skills_match,
            'experienceMatch': experience_match,
        }
    
    def _parse_experience(self, experience_str: str) -> int:
        """Extract years from experience string"""
        import re
        match = re.search(r'\d+', experience_str)
        return int(match.group()) if match else 0
    
    def _calculate_skills_match(self, candidate_skills: List[str], required_skills: List[str]) -> float:
        """Calculate how many required skills the candidate has"""
        if not required_skills:
            return 70.0
        
        # Convert to lowercase for comparison
        candidate_skills_lower = [s.lower() for s in candidate_skills]
        required_skills_lower = [s.lower() for s in required_skills]
        
        # Count matches
        matches = sum(
            1 for req in required_skills_lower
            if any(req in skill for skill in candidate_skills_lower)
        )
        
        return (matches / len(required_skills_lower)) * 100
    
    def _calculate_experience_match(self, years: int, min_years: int) -> float:
        """Calculate experience match"""
        if years >= min_years + 5:
            return 100.0  # Over-qualified
        elif years >= min_years:
            return 85.0   # Meets requirement
        elif years >= max(0, min_years - 1):
            return 70.0   # Close to requirement
        else:
            return max(30.0, (years / max(1, min_years)) * 100)
    
    def _calculate_resume_match(self, resume_text: str, job_description: str) -> float:
        """Calculate resume match using simple text similarity"""
        if not job_description:
            return 65.0
        
        resume_words = set(resume_text.lower().split())
        job_words = set(job_description.lower().split())
        
        # Calculate Jaccard similarity
        intersection = resume_words & job_words
        union = resume_words | job_words
        
        if not union:
            return 50.0
        
        return (len(intersection) / len(union)) * 100
    
    def predict_batch(self, candidates: List[Dict], job_requirements: Dict) -> List[Dict]:
        """Rank multiple candidates"""
        results = []
        for candidate in candidates:
            score = self.calculate_score(candidate, job_requirements)
            results.append({
                'candidateId': candidate.get('id'),
                'name': candidate.get('name'),
                **score
            })
        return results


# Initialize model
ranking_model = CandidateRankingModel()


# ============================================
# API Endpoints
# ============================================

@app.route('/api/rank-candidate', methods=['POST'])
def rank_candidate():
    """
    Rank a single candidate
    
    Request:
    {
        "candidate": {
            "name": "John Doe",
            "email": "john@example.com",
            "phone": "+1234567890",
            "experience": "5 years",
            "skills": ["Python", "React", "Node.js"]
        },
        "jobRequirements": {
            "requiredSkills": ["Python", "JavaScript"],
            "minExperience": 3,
            "jobDescription": "..."
        }
    }
    """
    try:
        data = request.get_json()
        candidate = data.get('candidate', {})
        job_requirements = data.get('jobRequirements', {})
        
        # Validate
        if not candidate.get('name'):
            return jsonify({'error': 'Missing candidate data'}), 400
        
        # Calculate score
        scores = ranking_model.calculate_score(candidate, job_requirements)
        
        logger.info(f"Ranked candidate: {candidate.get('name')} - Score: {scores['aiScore']}")
        
        return jsonify(scores)
    
    except Exception as e:
        logger.error(f"Error ranking candidate: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/rank-candidates-batch', methods=['POST'])
def rank_candidates_batch():
    """
    Rank multiple candidates
    
    Request:
    {
        "candidates": [...],
        "jobRequirements": {...}
    }
    """
    try:
        data = request.get_json()
        candidates = data.get('candidates', [])
        job_requirements = data.get('jobRequirements', {})
        
        # Rank all candidates
        results = ranking_model.predict_batch(candidates, job_requirements)
        
        logger.info(f"Ranked {len(results)} candidates")
        
        return jsonify({
            'results': results,
            'total': len(results)
        })
    
    except Exception as e:
        logger.error(f"Error batch ranking: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'service': 'candidate-ranking'})


@app.route('/api/model-info', methods=['GET'])
def model_info():
    """Get model information"""
    return jsonify({
        'name': 'Candidate Ranking Model',
        'version': '1.0.0',
        'weights': {
            'skills': 0.4,
            'experience': 0.35,
            'resume': 0.25
        }
    })


# ============================================
# Production Setup
# ============================================

if __name__ == '__main__':
    # Development
    app.run(debug=True, port=5000)
    
    # Production: Use gunicorn
    # gunicorn -w 4 -b 0.0.0.0:5000 ranking_service:app
