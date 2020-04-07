import React, { Component } from 'react';
import { UserSession } from 'blockstack';
import { showBlockstackConnect } from '@blockstack/connect';
import { appConfig, authOptions } from './constants';
import './Landing.css';

const Landing = () => {
  const signIn = e => {
    e.preventDefault();
    showBlockstackConnect({
      ...authOptions,
      finished: session => {
        window.location.href = '/';
      },
    });
  };

  return (
    <div className="Landing">
      <div className="form-signin">
        <h1 className="h1 mb-3 font-weight-normal">Monster Kingdom</h1>
        <button className="btn btn-lg btn-primary btn-block" onClick={signIn}>
          Sign in with Blockstack
        </button>
      </div>
    </div>
  );
};

export default Landing;
