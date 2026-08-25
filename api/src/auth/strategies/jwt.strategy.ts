import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { FirestoreService } from "../../firestore/firestore.service";
import { COLLECTIONS } from "../../firestore/collections";
import { UserDoc } from "../../firestore/models";

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  isSuperAdmin: boolean;
  isPlatformAdmin: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private firestore: FirestoreService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET", "fallback-secret"),
    });
  }

  async validate(payload: JwtPayload) {
    const doc = await this.firestore.collection<UserDoc>(COLLECTIONS.users).doc(payload.sub).get();
    const user = doc.data();

    if (!user || !user.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      tenantId: user.tenantId,
      isActive: user.isActive,
      isSuperAdmin: user.isSuperAdmin,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }
}
