// @flow
import Raven from 'shared/raven';
import type { GraphQLContext } from '../../';
import type { EditUserInput } from '../../models/user';
import UserError from '../../utils/UserError';
import { getUser, editUser } from '../../models/user';
import { events } from 'shared/analytics';
import { trackQueue } from 'shared/bull/queues';
import { isAuthedResolver as requireAuth } from '../../utils/permissions';

export default requireAuth(
  async (
    _: any,
    args: EditUserInput,
    { user, updateCookieUserData }: GraphQLContext
  ) => {
    const currentUser = user;
    // If the user is trying to change their username check whether there's a person with that username already
    if (args.input.username) {
      if (
        args.input.username === 'null' ||
        args.input.username === 'undefined'
      ) {
        trackQueue.add({
          userId: user.id,
          event: events.USER_EDITED_FAILED,
          properties: {
            reason: 'bad username input',
          },
        });

        return new UserError('Nice try! 😉');
      }

      const dbUser = await getUser({ username: args.input.username });
      if (dbUser && dbUser.id !== user.id) {
        trackQueue.add({
          userId: user.id,
          event: events.USER_EDITED_FAILED,
          properties: {
            reason: 'username taken',
          },
        });

        return new UserError(
          'Looks like that username got swooped! Try another?'
        );
      }
    }

    return editUser(args, user.id).then(async res => {
      await updateCookieUserData({
        ...res,
      }).catch(err => {
        Raven.captureException(
          new Error(`Error updating cookie user data: ${err.message}`)
        );
        return res;
      });

      return res;
    });
  }
);
