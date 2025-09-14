import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'node:crypto';

class ReceiptGeneration {
  constructor() {
    this.hashAlgorithm = 'sha256';
  }

  // Generate digital receipt for vote
  generateReceipt(voteData, encryptedVote, zkProof) {
    const receiptId = uuidv4();
    const verificationCode = this.generateVerificationCode();
    
    const receiptData = {
      receiptId,
      voteId: voteData.voteId,
      electionId: voteData.electionId,
      userId: voteData.userId,
      timestamp: new Date().toISOString(),
      verificationCode,
      voteCommitment: encryptedVote.commitment,
      proofHash: this.hashData(zkProof),
      electionHash: voteData.electionHash,
      receiptVersion: '1.0'
    };
    
    const receiptHash = this.generateReceiptHash(receiptData);
    
    return {
      receiptId,
      verificationCode,
      receiptHash,
      receiptData: {
        ...receiptData,
        receiptHash
      }
    };
  }

  // Generate verification code
  generateVerificationCode() {
    const randomData = randomBytes(16);
    const hash = createHash(this.hashAlgorithm).update(randomData).digest('hex');
    return hash.substring(0, 12).toUpperCase();
  }

  // Generate receipt hash
  generateReceiptHash(receiptData) {
    const dataString = JSON.stringify(receiptData, Object.keys(receiptData).sort());
    return createHash(this.hashAlgorithm).update(dataString).digest('hex');
  }

  // Hash data for inclusion in receipt
  hashData(data) {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return createHash(this.hashAlgorithm).update(dataString).digest('hex');
  }

  // Verify receipt integrity
  verifyReceipt(receiptData) {
    try {
      const { receiptHash, ...dataWithoutHash } = receiptData;
      const calculatedHash = this.generateReceiptHash(dataWithoutHash);
      
      return {
        isValid: calculatedHash === receiptHash,
        calculatedHash,
        providedHash: receiptHash,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  // Generate batch receipts for multiple votes
  generateBatchReceipts(votesData) {
    return votesData.map(voteData => this.generateReceipt(
      voteData.voteData,
      voteData.encryptedVote,
      voteData.zkProof
    ));
  }

  // Create receipt PDF (returns base64 encoded PDF data)
  createReceiptPDF(receiptData) {
    // Simplified PDF generation - in production use proper PDF library
    const pdfContent = {
      title: 'Vottery Digital Receipt',
      content: {
        'Receipt ID': receiptData.receiptId,
        'Verification Code': receiptData.verificationCode,
        'Election ID': receiptData.electionId,
        'Timestamp': receiptData.timestamp,
        'Receipt Hash': receiptData.receiptHash
      },
      footer: 'This receipt proves your vote was recorded. Keep it safe for verification.'
    };

    // Convert to base64 (simplified)
    const pdfBase64 = Buffer.from(JSON.stringify(pdfContent)).toString('base64');
    
    return {
      format: 'application/pdf',
      data: pdfBase64,
      filename: `receipt_${receiptData.verificationCode}.pdf`
    };
  }
}

export default ReceiptGeneration;