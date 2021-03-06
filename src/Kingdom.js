import React, { Component } from 'react';
import { Link } from 'react-router-dom';
import { UserSession, getUserAppFileUrl } from 'blockstack';
import { UserSessionChat } from './UserSessionChat';
import { jsonCopy, subjectFromKingdomUrl, loadRuler, loadSubjects, resolveSubjects } from './utils';
import Subject from './Subject';
import { appConfig, SUBJECTS_FILENAME, EXPLORER_URL } from './constants';
import { Contact } from 'blockstack-collections';

import './Kingdom.css';

const KINGDOM_DOMAIN = 'https://planet.friedger.de';

class Kingdom extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ruler: {
        animal: {},
        territory: {},
      },
      subjects: [],
      value: '',
      app: `${props.protocol}//${props.realm}`,
      rulerUsername: props.ruler,
      clickAdd: false,
      clickContactAdd: false,
      msg: 'Messages will appear here from your chat provider openintents.modular.im (OI Chat)',
    };
    this.userSession = new UserSession({ appConfig });
    this.addSubject = this.addSubject.bind(this);
    this.addContact = this.addContact.bind(this);
    this.removeSubject = this.removeSubject.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleContactChange = this.handleContactChange.bind(this);
    this.loadKingdom = this.loadKingdom.bind(this);
    this.notifySubject = this.notifySubject.bind(this);
    this.userSessionChat = new UserSessionChat(this.userSession);
  }

  componentWillMount() {
    const app = this.state.app;
    const ruler = this.props.ruler;
    this.loadKingdom(ruler, app);
    const search = window.location.search;
    if (search) {
      const appUrl = search.split('=')[1];
      this.setState({
        value: appUrl,
        clickAdd: true,
      });
    }
    this.userSessionChat.setOnMessageListener((event, room, toStartOfTimeline, removed, data) => {
      if (data.liveEvent) {
        var messageToAppend = room.timeline[room.timeline.length - 1];
        if (messageToAppend.event.type === 'm.room.message') {
          const msg = messageToAppend.sender.name + ': ' + messageToAppend.event.content.body;
          this.setState({ msg });
          console.log('msg received', messageToAppend);
        }
      }
    });
  }

  componentWillReceiveProps(nextProps) {
    const nextSubjects = nextProps.subjects;
    if (nextSubjects) {
      if (nextSubjects.length !== this.state.subjects.length) {
        this.setState({ subjects: jsonCopy(nextSubjects) });
      }
      resolveSubjects(this, this.userSession, nextSubjects);
    }
  }

  handleContactChange(event) {
    this.setState({ contact: event.target.value });
  }

  handleChange(event) {
    this.setState({ value: event.target.value });
  }

  loadKingdom(ruler, app) {
    loadRuler(this.userSession, ruler, app).then(ruler => {
      if (ruler) {
        this.setState({ ruler });
      }
    });

    loadSubjects(this.userSession, ruler, app).then(subjects => {
      this.setState({ subjects });
      resolveSubjects(this, this.userSession, subjects);
    });

    const contacts = [];
    console.log('loading contacts');
    try {
      Contact.list(async c => {
        console.log('trying', c);
        const contact = await Contact.get(c);
        let contactUrl;
        try {
          contactUrl = await getUserAppFileUrl(
            'me.json',
            contact.attrs.blockstackID,
            KINGDOM_DOMAIN
          );
        } catch (e) {
          contactUrl = null;
          console.log(e);
        }
        if (contactUrl != null) {
          try {
            console.log('adding', c);
            contacts.push(contact);
          } catch (e) {
            console.log(e);
          }
        } else {
          console.log(`User not on ${KINGDOM_DOMAIN}`, contact);
        }
      });
    } catch (e) {
      console.log('no permissions to use Contact collection', e);
    }
    this.setState({ contacts });
  }

  notifySubject(subject, content) {
    this.userSessionChat
      .createNewRoom(
        'Monster Kingdom ' + this.props.ruler + ' & ' + subject.username,
        'Welcome from ' + this.props.ruler
      )
      .then(roomResult => {
        this.userSessionChat
          .sendMessage(subject.username, roomResult.room_id, content)
          .then(result => {
            console.log('result ', result);
          })
          .catch(error => {
            console.log('error', error);
            if (error.errcode === 'M_CONSENT_NOT_GIVEN') {
              var linkUrl = error.message.substring(
                error.message.indexOf('https://openintents.modular.im'),
                error.message.length - 1
              );
              console.log(linkUrl);
              var msg =
                subject.username +
                ' was not notified. Please review the T&C of your chat provider openintents.modular.im (OI Chat)';
              this.setState({ msg, err: error.message, linkUrl });
            }
          });
      })
      .catch(error => {
        console.log('error from create room', error);
      });
  }

  addSubject(e) {
    e.preventDefault();
    const subject = subjectFromKingdomUrl(this.state.value);

    const content = {
      msgtype: 'm.text',
      body: 'I just added you to my kingdom. Come and join me there!',
      format: 'org.matrix.custom.html',
      formatted_body: `I just added you to my kingdom! Come and join me <a href="${KINGDOM_DOMAIN}"> there</a>!`,
    };
    this.notifySubject(subject, content);
    const subjects = jsonCopy(this.state.subjects);
    this.setState({ value: '', clickAdd: false });
    subjects.push(subject);
    this.setState({ subjects });
    this.saveSubjects(subjects);
  }

  addContact(e) {
    e.preventDefault();
    const subject = subjectFromKingdomUrl(`${KINGDOM_DOMAIN}/kingdom/${this.state.contact}`);
    const subjects = jsonCopy(this.state.subjects);
    this.setState({ contact: '', clickContactAdd: false });
    subjects.push(subject);
    this.setState({ subjects });
    this.saveSubjects(subjects);
  }

  removeSubject(e, index) {
    e.preventDefault();
    const subjects = jsonCopy(this.state.subjects);
    const subject = subjects.splice(index, 1)[0]; // remove subject at index
    console.log('removed subject', subject);
    this.setState({ subjects });
    this.saveSubjects(subjects);
    const content = {
      msgtype: 'm.text',
      body: 'I just banished ' + subject.username + ', sorry!',
      format: 'org.matrix.custom.html',
      formatted_body: 'I just banished <subjectlink/>, sorry!',
    };
    this.notifySubject(subject, content);
  }

  saveSubjects(subjects) {
    const options = { encrypt: false };
    this.userSession.putFile(SUBJECTS_FILENAME, JSON.stringify(subjects), options).finally(() => {
      if (window.location.search) {
        window.history.pushState(null, '', window.location.href.split('?')[0]);
      }
      resolveSubjects(this, this.userSession, subjects);
    });
  }

  render() {
    const mine = this.props.myKingdom;
    const ruler = this.state.ruler;
    const rulerAnimal = ruler.animal;
    const rulerTerritory = ruler.territory;
    const username = this.state.rulerUsername;
    const subjects = this.state.subjects;
    const myKingdom = this.props.myKingdom;
    const app = this.state.app;
    const clickAdd = this.state.clickAdd;
    const clickContactAdd = this.state.clickContactAdd;
    const currentUsername = this.props.currentUsername;
    const msg = this.state.msg;
    const err = this.state.err;
    const linkUrl = this.state.linkUrl;
    const contacts = this.state.contacts;
    return (
      <div className="Kingdom">
        <div className="row">
          <div
            className="col-lg-12 territory"
            style={{
              backgroundImage: `url('${app}/territories/${rulerTerritory.id}.jpg')`,
            }}
          >
            {rulerAnimal && rulerAnimal.name ? (
              <img
                className="rounded-circle"
                src={`${app}/animals/${rulerAnimal.id}.jpg`}
                alt={rulerAnimal.name}
              />
            ) : (
              <img
                className="rounded-circle"
                src="data:image/gif;base64,R0lGODlhAQABAIAAAHd3dwAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="
                alt="The Ruler"
              />
            )}
          </div>
        </div>
        {msg && (
          <div className="row">
            <div className="col-lg-12">{msg}</div>
          </div>
        )}
        {err && (
          <div className="row">
            <div className="col-lg-12">
              <a href={linkUrl} target="_blank" rel="noopener">
                {err}
              </a>
            </div>
          </div>
        )}
        <div className="row ruler">
          <div className="col-lg-12">
            <h2>Ruler {username}</h2>
            {rulerAnimal ? (
              <p>
                <a href={`${EXPLORER_URL}/name/${username}`} target="_blank">
                  {username}
                </a>{' '}
                is a {rulerAnimal.name} that rules over the {rulerTerritory.name}.
              </p>
            ) : (
              <p>{username} is an unknown animal that hails from an unknown land.</p>
            )}
            <p>
              {mine ? (
                <Link className="btn btn-primary" to="/me" role="button">
                  Edit my monster
                </Link>
              ) : (
                <a
                  className="btn btn-primary"
                  href={`${window.location.origin}/kingdom/${currentUsername}?add=${app}/kingdom/${username}`}
                >
                  Add ruler to my kingdom
                </a>
              )}
            </p>
            <div className="container">
              <h2>Subjects</h2>
              {mine ? (
                <div className="row justify-content-center">
                  <div
                    id="addSubject"
                    className="add-frame col-lg-8"
                    style={{ borderColor: clickAdd ? 'red' : '#f8f9fa' }}
                  >
                    <form onSubmit={this.addSubject} className="input-group">
                      <input
                        className="form-control"
                        type="url"
                        onChange={this.handleChange}
                        value={this.state.value}
                        required
                        placeholder="https://example.com/kingdom/ruler.id"
                      />
                      <div className="input-group-append">
                        <input type="submit" className="btn btn-primary" value="Add subject" />
                      </div>
                    </form>
                  </div>

                  {contacts && contacts.length > 0 && (
                    <div
                      id="addContact"
                      className="add-frame col-lg-8"
                      style={{
                        borderColor: clickContactAdd ? 'red' : '#f8f9fa',
                      }}
                    >
                      <form onSubmit={this.addContact} className="input-group">
                        <select
                          className="form-control"
                          type="text"
                          onChange={this.handleContactChange}
                          value={this.state.contact}
                          required
                          placeholder="name.id"
                        >
                          <option value=""></option>
                          {contacts.map((contact, index) => {
                            return (
                              <option value={contact.attrs.blockstackID} key={contact.identifier}>
                                {contact.attrs.firstName}
                              </option>
                            );
                          })}
                        </select>
                        <div className="input-group-append">
                          <input type="submit" className="btn btn-primary" value="Add Contact" />
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="card-deck">
                {subjects.map((subject, index) => {
                  return (
                    <Subject
                      key={index}
                      index={index}
                      subject={subject}
                      removeSubject={this.removeSubject}
                      myKingdom={myKingdom}
                      currentUsername={currentUsername}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default Kingdom;
