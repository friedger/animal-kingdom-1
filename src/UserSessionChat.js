import { UserSession, config } from 'blockstack'
import * as matrixcs from 'matrix-js-sdk'
import { decodeToken } from 'jsontokens'
import { parseZoneFile } from 'zone-file'


export class UserSessionChat {
    userSession: UserSession

    constructor(session) {
        this.userSession = session
        this.matrixClient = matrixcs.createClient("https://openintents.modular.im")
    }


    getOTP(userData) {
        var txid = userData.identityAddress + "" + Math.random();
        console.log("txid", txid)
        return fetch("https://auth.openintents.org/c/" + txid, { method: "POST" })
            .then(response => { return response.json(); }, error => console.log("error", error))
            .then(c => {
                const challenge = c.challenge;
                console.log("challenge", challenge)
                return this.userSession.putFile("mxid.json", challenge, { encrypt: false }).then(() => {
                    return {
                        username: userData.identityAddress.toLowerCase(),
                        password: txid + "|" + window.location.origin + "|" + userData.username
                    }
                }, error => console.log("err2", error))
            })
    }

    sendMessage(receiverName, roomId, content) {
        return this.lookupProfile(receiverName).then(receiverProfile => {
            console.log("receiver", receiverProfile)
            const receiverMatrixAccount = "@" + receiverProfile.identityAddress.toLowerCase() + ":openintents.modular.im"
            content.formatted_body = content.formatted_body.replace("<subjectlink/>", "<a href=\"https://matrix.to/#/" + receiverMatrixAccount + "\">" + receiverProfile.identityAddress + "</a>")
            const userData = this.userSession.loadUserData()
            const matrixClient = this.matrixClient
            return this.getOTP(userData).then(result => {
                matrixClient.login("m.login.password",
                    {
                        identifier: {
                            "type": "m.id.user",
                            "user": result.username
                        },
                        user: result.username,
                        password: result.password,
                        initial_device_display_name: "From OI Chat Account Manager"
                    }, function (err, data) {
                        console.log("err", err)
                        console.log("data", data)
                        if (!err) {
                            matrixClient.on("event", function (event) {
                                console.log("mxEvent", event.getType());
                            })

                            matrixClient.on("Room.timeline", function (event, room, toStartOfTimeline, removed, data) {
                                if (!toStartOfTimeline && data.liveEvent) {
                                    var messageToAppend = room.timeline[room.timeline.length - 1];
                                    console.log("timeline", room.timeline)
                                    console.log("msg received", messageToAppend)
                                }
                            })
                            console.log("event listeners are setup")
                        } else {
                            return Promise.reject(err)
                        }
                        /*
                        this.matrixClient.createRoom("Animal Kingdom from " + userData.username, [receiverMatrixAccount], function (err, data) {
                            roomId = data
                        });
                        */
                        matrixClient.joinRoom(roomId, {}, function (err, data) {
                            console.log("err", err)
                            console.log("data", data)
                            if (err && !data) {
                                return Promise.reject(err)
                            }
                            matrixClient.invite(roomId, receiverMatrixAccount, (err, res) => {
                                console.log("err", err)
                                console.log("data", data)
                                if (err && !data) {
                                    return Promise.reject(err)
                                }
                                matrixClient.sendEvent(roomId, "m.room.message", content, "", (err, res) => {
                                    if (err) {
                                        console.log(err);
                                        return Promise.reject(err)
                                    } else {
                                        console.log(res);
                                        return Promise.resolve(res)
                                    }
                                });
                            })
                        })
                    });
            })
        })
    }

    lookupProfile(username) {
        if (!username) {
            return Promise.reject()
        }
        let lookupPromise = config.network.getNameInfo(username)
        return lookupPromise
            .then((responseJSON) => {
                if (responseJSON.hasOwnProperty('zonefile')
                    && responseJSON.hasOwnProperty('address')) {
                    return this.resolveZoneFileToProfile(responseJSON.zonefile, responseJSON.address)
                } else {
                    throw new Error('Invalid zonefile lookup response: did not contain `address`'
                        + ' or `zonefile` field')
                }
            })
    }

    resolveZoneFileToProfile(zoneFile, address) {
        return new Promise((resolve, reject) => {
            let zoneFileJson = null
            try {
                zoneFileJson = parseZoneFile(zoneFile)
                if (!zoneFileJson.hasOwnProperty('$origin')) {
                    zoneFileJson = null
                }
            } catch (e) {
                reject(e)
            }
            console.log("zoneFile", zoneFileJson)
            let tokenFileUrl = null
            if (zoneFileJson && Object.keys(zoneFileJson).length > 0) {
                tokenFileUrl = this.getTokenFileUrl(zoneFileJson)
            } else {
                let profile = null
                try {
                    profile = JSON.parse(zoneFile)
                } catch (error) {
                    reject(error)
                }
                resolve(profile)
                return
            }

            if (tokenFileUrl) {
                fetch(tokenFileUrl)
                    .then(response => response.text())
                    .then(responseText => JSON.parse(responseText))
                    .then((responseJson) => {
                        const tokenRecords = responseJson
                        const profile = this.extractProfile(tokenRecords[0].token, address)
                        profile.identityAddress = address
                        resolve(profile)
                    })
                    .catch((error) => {
                        console.error(`resolveZoneFileToProfile: error fetching token file ${tokenFileUrl}`, error)
                        reject(error)
                    })
            } else {
                console.debug('Token file url not found. Resolving to blank profile.')
                resolve({})
            }
        })
    }


    getTokenFileUrl(zoneFileJson) {
        if (!zoneFileJson.hasOwnProperty('uri')) {
            return null
        }
        if (!Array.isArray(zoneFileJson.uri)) {
            return null
        }
        if (zoneFileJson.uri.length < 1) {
            return null
        }
        const firstUriRecord = zoneFileJson.uri[0]

        if (!firstUriRecord.hasOwnProperty('target')) {
            return null
        }
        let tokenFileUrl = firstUriRecord.target

        if (tokenFileUrl.startsWith('https')) {
            // pass
        } else if (tokenFileUrl.startsWith('http')) {
            // pass
        } else {
            tokenFileUrl = `https://${tokenFileUrl}`
        }

        return tokenFileUrl
    }

    extractProfile(token, address) {
        let decodedToken

        decodedToken = decodeToken(token)

        // TOD verify token

        let profile = {}
        if (decodedToken.hasOwnProperty('payload')) {
            console.log("payload", decodedToken.payload)
            const payload = decodedToken.payload
            if (payload.hasOwnProperty('claim')) {
                profile = decodedToken.payload.claim
            }
            profile.identityAddress = address
        }

        return profile
    }
}
