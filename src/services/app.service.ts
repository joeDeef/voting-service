import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  castVote(): string {
    // Logic to cast a vote
    return 'Vote cast successfully!';
  }
  confirmVote(): string {
    // Logic to confirm a vote
    return 'Vote confirmed successfully!';
  }

  confirmUpBlockchain(): string {
    // Logic to update the blockchain
    return 'Blockchain updated successfully!';
  }

  setTimeot(): string {
    // Logic to set the voting time
    // Obtengo el token para la red blockhain
    const token = this.getToken();
    return 'Voting time set successfully!';
  }

  getToken(): string {
    // Logic to get the token for blockchain network
    return 'blockchain-token';
  }
}
