const dotenv = require("dotenv");
dotenv.config();

const db = require("../../models/index");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const bcrypt = require("bcrypt");

const mailer = require("nodemailer");
const smtp = require("nodemailer-smtp-transport");

const accessTokenRequest = require("./accessTokenRequest");
const mailMethod = require("../../method/mail");

module.exports = {
  /*
      user 로그인
  */
  login: async (req, res) => {
    const { email } = req.params;
    const { password } = req.body;
    const userInfo = await db["User"].findOne({
      where: { email },
    });

    if (!userInfo) {
      res.status(400).send({ message: "not exists user email" });
    }

    bcrypt.compare(password, userInfo.password, function (err, resp) {
      if (resp === false) {
        res.status(401).send({ message: "unAuthorized" });
      } else if (resp === true) {
        delete userInfo.dataValues.password;

        const accessToken = jwt.sign(
          userInfo.dataValues,
          process.env.ACCESS_SECRET,
          {
            expiresIn: "15m",
          }
        );

        const refreshToken = jwt.sign(
          userInfo.dataValues,
          process.env.REFRESH_SECRET,
          {
            expiresIn: "30d",
          }
        );
        res.cookie("refreshToken", refreshToken, {
          httpOnly: true,
          sameSite: "none",
          secure: false,
        });
        res
          .status(200)
          // .cookie("refreshToken", refreshToken, {
          //   httpOnly: true,
          //   sameSite: "none",
          // })
          .json({
            data: { accessToken: accessToken },
            message: "login successful",
          });
      } else {
        res.status(500).send({ message: "err" });
      }
    });
  },

  /*
      user 로그아웃
  */
  logout: async (req, res) => {
    // 클라이언트에서 accessToken 지워주세요!
    res.clearCookie("refreshToken");
    res.status(200).send({ message: "logout successful" });
  },

  /*
      github 콜백
  */
  githubCallback: async (req, res) => {
    axios({
      method: "post",
      url: `https://github.com/login/oauth/access_token`,
      headers: {
        accept: "application/json",
      },
      data: {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code: req.body.authorizationCode,
      },
    })
      .then((result) =>
        res
          .status(200)
          .cookie("refreshToken", refresh_Token, {
            httpOnly: true,
            samSite: "none",
          })
          .json({ accessToken: result.data.access_token, message: "ok" })
      )
      .catch((err) => res.status(404));
  },

  /*
      kakao 콜백
  */
  kakaoCallback: async (req, res) => {
    axios({
      method: "post",
      url: `https://kauth.kakao.com/oauth/token`,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },

      data: qs.stringify({
        client_id: process.env.KAKAO_CLIENT_ID,
        client_secret: process.env.KAKAO_CLIENT_SECRET,
        code: req.body.authorization_code,
      }),
    })
      .then((result) =>
        res
          .status(200)
          .cookie("refreshToken", refresh_Token, {
            httpOnly: true,
            samSite: "none",
          })
          .json({ accessToken: result.data.access_token, message: "ok" })
      )
      .catch((err) => res.status(404));
  },

  /*
      user 회원가입시 이메일 인증 
  */
  signupEmailAuth: async (req, res) => {
    let number = Math.floor(Math.random() * 1000000) + 100000;
    if (number > 1000000) {
      number = number - 100000;
    }

    let title = "Form Bakery 회원가입 인증번호 입니다.";
    let html = `
            <h1>아래의 인증번호를 Form Bakery 홈페이지 인증번호창에 입력해 주세요.</h1>
            <h2>[${number}]</h2>
            <br/>
            <h3>문의: ${process.env.MAIL_EMAIL}</h3>
      `;

    mailMethod.sendEmail(
      req,
      res,
      process.env.MAIL_EMAIL,
      req.body.email,
      title,
      html,
      true,
      number
    );
  },

  /*
      user 비밀번호 변경시, 이메일 인증
  */
  passwordEmailAuth: async (req, res) => {
    const { email } = req.body;
    const userInfo = await db["User"].findOne({
      where: { email },
    });
    if (!userInfo) {
      res.status(400).send({ message: "not exists email" });
    }

    let number = Math.floor(Math.random() * 1000000) + 100000;
    if (number > 1000000) {
      number = number - 100000;
    }

    let title = "Form Bakery 비밀번호 재설정 인증번호 입니다.";
    let html = `
            <h1>아래의 인증번호를 Form Bakery 홈페이지 인증번호창에 입력해 주세요.</h1>
            <h2>[${number}]</h2>
            <br/>
            <h3>문의: ${process.env.MAIL_EMAIL}</h3>
      `;

    mailMethod.sendEmail(
      req,
      res,
      process.env.MAIL_EMAIL,
      req.body.email,
      title,
      html,
      true,
      number
    );
  },

  /*
      user 회원가입
  */
  signup: async (req, res) => {
    const { email, password, name, nickname } = req.body;
    if (!email || !password || !name || !nickname) {
      res.status(422).send({ message: "insufficient parameters supplied" });
    } else {
      const userInfo = await db["User"].findOne({
        where: { email },
      });
      if (userInfo) {
        res.status(409).send({ message: "email exists" });
      } else {
        const encryptedPassword = bcrypt.hashSync(
          password,
          Number(process.env.PASSWORD_SALT)
        );
        db["User"].create({
          email,
          password: encryptedPassword,
          name,
          nickname,
        });
        const newUser = {
          email,
          name,
          nickname,
        };
        const accessToken = jwt.sign(newUser, process.env.ACCESS_SECRET, {
          expiresIn: "15m",
        });
        const refreshToken = jwt.sign(newUser, process.env.REFRESH_SECRET, {
          expiresIn: "30d",
        });
        res
          .status(201)
          .cookie("refreshToken", refreshToken, {
            httpOnly: true,
            samSite: "none",
          })
          .json({
            data: { accessToken: accessToken },
            message: "signup successful",
          });
      }
    }
  },

  /*
      user 회원탈퇴
  */
  signout: async (req, res) => {
    const { password } = req.body;
    const { email } = req.params;

    const userInfo = await db["User"].findOne({
      where: { email },
    });

    bcrypt.compare(password, userInfo.password, function (err, resp) {
      if (resp === false) {
        res.status(404).send({ message: "incorrect password" });
      } else if (resp === true) {
        db["User"].destroy({
          where: { email: userInfo.email },
        });
        res.status(200).send({ message: "signout successful" });
      } else {
        res.status(500).send({ message: "err" });
      }
    });
  },

  /*
      user 개인정보 정보가져오기
  */
  getUserInfo: async (req, res) => {
    if (!req.headers.authorization) {
      await accessTokenRequest.accessTokenRequest(req, res);
      return;
    } else {
      jwt.verify(
        req.headers.authorization,
        process.env.ACCESS_SECRET,
        async (err, decoded) => {
          if (err) {
            await accessTokenRequest.accessTokenRequest(req, res);
          } else {
            const userInfo = await db["User"].findOne({
              where: { email: decoded.email },
            });
            if (!userInfo) {
              res.status(404).json({
                message: "access token has been tempered",
              });
            } else {
              delete userInfo.dataValues.password;
              res.status(200).json({
                data: {
                  userInfo: userInfo.dataValues,
                },
                message: "ok",
              });
            }
          }
        }
      );
    }
  },

  /*
      user 개인정보 수정
  */
  updateUserInfo: async (req, res) => {
    const { email } = req.params;
    const { name, nickname } = req.body;

    if (!req.headers.authorization) {
      await accessTokenRequest.accessTokenRequest(req, res, "update");
    } else {
      jwt.verify(
        req.headers.authorization,
        process.env.ACCESS_SECRET,
        async (err, decoded) => {
          if (err) {
            await accessTokenRequest.accessTokenRequest(req, res, "update");
          } else {
            const userInfo = await db["User"].findOne({
              where: { email: decoded.email },
            });
            delete userInfo.dataValues.password;

            if (!userInfo) {
              res.status(404).json({
                message: "access token has been tempered",
              });
            } else {
              await db["User"].update(
                { name, nickname },
                { where: { email: decoded.email } }
              );
              userInfo.dataValues.name = name;
              userInfo.dataValues.nickname = nickname;

              res.status(200).json({
                data: {
                  userInfo: userInfo.dataValues,
                },
                message: "ok",
              });
            }
          }
        }
      );
    }
  },

  /*
      user 비밀번호 변경
  */
  changePassword: async (req, res) => {
    const { email } = req.params;
    const { password, newPassword } = req.body;

    const userInfo = await db["User"].findOne({
      where: { email: req.params.email },
    });

    bcrypt.compare(password, userInfo.password, function (err, resp) {
      if (resp === false) {
        res.status(401).send({ message: "unAuthorized" });
      } else if (resp === true) {
        const encryptedPassword = bcrypt.hashSync(
          newPassword,
          Number(process.env.PASSWORD_SALT)
        );

        db["User"].update(
          { password: encryptedPassword },
          { where: { email } }
        );
        res.status(200).send({ message: "changePassword successful" });
      } else {
        res.status(500).send({ message: "err" });
      }
    });
  },

  /*
      잊어버린 user 비밀번호 변경
  */
  forgetPassword: async (req, res) => {
    const { email } = req.params;
    const { newPassword } = req.body;

    const userInfo = await db["User"].findOne({
      where: { email },
    });
    if (!userInfo) {
      res.status(401).send({ message: "no exists email" });
    } else {
      const encryptedPassword = bcrypt.hashSync(
        newPassword,
        Number(process.env.PASSWORD_SALT)
      );

      db["User"].update({ password: encryptedPassword }, { where: { email } });
      res.status(200).send({ message: "changePassword successful" });
    }
  },

  /*
      userProfile image 저장
  */
  uploadProfileImage: async (req, res) => {
    const { email } = req.params;
    const { filename } = req.file;
    db["User"]
      .update(
        {
          profilePicture: filename,
        },
        {
          where: { email },
        }
      )
      .then((result) => {
        res.status(201).send({
          message: "ok",
        });
      });
  },
};
